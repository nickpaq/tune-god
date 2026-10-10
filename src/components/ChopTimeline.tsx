import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { approach, isDrag, spanAfterDrag, viewUnderFinger, zoomRate, zoomRoom } from "../audio/song/zoom";
import { MAX_SECTION_BARS, isBarLine, lineFrame, linesBetween, type TapGrid } from "../audio/song/tapGrid";

/** Height (CSS pixels) of the strip along the top that carries the chop flags, and of the one along the bottom that carries the downbeat flags. */
const FLAG_H = 14;
/** The closest view, in seconds across. */
const MIN_SPAN_SECONDS = 0.1;
/** A bar narrower than this on the screen (CSS pixels) is too small to be a line of its own: the grid then shows (and the snap takes) every fourth bar, and at the widest views every sixteenth. */
const MIN_BAR_PX = 30;
/** Zooming in eases up over about this much downward travel (px); zooming out has no ease. */
const ZOOM_EASE_PX = 40;

/** Momentum after a scrub: the glide slows with this time constant (ms); in snap mode it is shorter, so the glide into the nearest line is barely changed. A release this long (ms) after the last movement glides nowhere; the glide ends below 0.02 px/ms. */
const COAST_TAU_MS = 260;
const COAST_SNAP_TAU_MS = 70;
const COAST_STALE_MS = 70;

/** In chopper mode the grid goes finer as the view zooms in (beats, eighths, sixteenths, never finer): a subdivision narrower than this on the screen (CSS pixels) is not drawn or snapped to. */
const MIN_STEP_PX = 10;
/** How much of the song the first view shows, in seconds. */
const START_SECONDS = 12;
/** The view counts as fully zoomed in until it is this much wider than the closest zoom: snapping stays off and the line does not coast, so a slight zoom out does not bring them back. */
const CLOSEST_MARGIN = 1.08;
/** Reaching the closest zoom (within this much of it) starts the free mode; it ends only once the view is CLOSEST_MARGIN wider. */
const CLOSEST_REACHED = 1.005;

/** A section as it is drawn: from frame to frame, in its colour. */
export interface DrawnSection {
  start: number;
  end: number;
  color: string;
}

export interface ChopTimelineHandle {
  /** The frame under the cursor line, in the middle of the view. */
  cursor: () => number;
  /** Moves the waveform so the cursor is on a frame. */
  setCursor: (frame: number) => void;
  /** Glides the line onto the nearest bar line and returns that line's frame (null with the magnet off or no line to go to). */
  snap: () => number | null;
  /** Whether the snap is in force right now: the magnet is on and the view is not at its closest zoom. */
  snapping: () => boolean;
  /** The divisions to a beat the grid shows at this zoom (4, 2, 1), or 0 for bar lines only. */
  division: () => number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return `${m}:${(Math.max(0, seconds) - m * 60).toFixed(2).padStart(5, "0")}`;
}

/**
 * The song's waveform in the screen's colours, scrolling behind a line fixed in the middle: that line is the cursor, where markers are put and where
 * the song plays from. Dragging scrubs (the waveform follows the finger, and the line is glides onto the nearest bar line when you let go), and dragging down zooms in, up zooms out. Over it: a line for every beat (the first beat of each bar
 * stronger), the sections between chop markers in their colours, the chop markers (flag on top, numbered) and the downbeat markers (flag below).
 */
export const ChopTimeline = forwardRef<
  ChopTimelineHandle,
  {
    pyramid: PeakPyramid;
    sampleRate: number;
    /** Null until the beat has been found. */
    grid: TapGrid | null;
    /** Where the chop markers sit (frames, already on their bar lines), in song order. */
    chops: number[];
    /** Where the downbeat markers sit (frames). */
    downbeats: number[];
    /** Where the 1.1.1 sits (frame), if set. */
    oneOne: number | null;
    sections: DrawnSection[];
    /** Whether the cursor is pulled onto the nearest grid line or marker while scrubbing. */
    magnetOn: boolean;
    /** A finger started scrubbing. */
    onScrub: () => void;
    /** The finger let go after scrubbing. Returns true when playback carries on from where the line is, which skips the snap. */
    onScrubEnd: () => boolean;
    /** Chopper mode: the grid and the snap go down to sixteenth notes when zoomed in, and chop markers may sit on them. */
    fine?: boolean;
    /** Acapella and synced mode: the grid and the snap go down to single beats when zoomed in (never finer), instead of whole bars. */
    beatGrid?: boolean;
  }
>(function ChopTimeline({ pyramid, sampleRate, grid, chops, downbeats, oneOne, sections, magnetOn, onScrub, onScrubEnd, fine = false, beatGrid = false }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const total = pyramid.totalFrames;
  const latest = useRef({ grid, chops, downbeats, oneOne, sections, magnetOn, onScrub, onScrubEnd, fine, beatGrid });
  latest.current = { grid, chops, downbeats, oneOne, sections, magnetOn, onScrub, onScrubEnd, fine, beatGrid };
  const initialSpan = Math.min(total, START_SECONDS * sampleRate);
  const view = useRef({ cursor: 0, span: initialSpan });
  const drag = useRef<{ id: number; startX: number; startY: number; y0: number; moved: boolean; pivot: number; span: number } | null>(null);
  /** The playhead's recent positions while scrubbing, for the glide on release. */
  const trail = useRef<{ t: number; cursor: number }[]>([]);
  const settling = useRef(0);
  const buffers = useRef({ lo: new Float32Array(0), hi: new Float32Array(0) });
  const minSpan = Math.min(total, MIN_SPAN_SECONDS * sampleRate);
  /** Free mode: set on reaching the closest zoom, cleared only after zooming out past CLOSEST_MARGIN, so a slight zoom out stays free. */
  const free = useRef(false);
  const inFreeMode = (): boolean => {
    const span = view.current.span;
    if (span <= minSpan * CLOSEST_REACHED) free.current = true;
    else if (span > minSpan * CLOSEST_MARGIN) free.current = false;
    return free.current;
  };
  /** Whether the snap is in force: the magnet is on and the view is not in free mode. */
  const snapping = () => latest.current.magnetOn && !inFreeMode();

  /**
   * The grid lines for this zoom, which are both the lines drawn and the lines the snap goes to: bar lines only, never anything finer. Every bar when a
   * bar is wide enough on the screen to tell apart, otherwise every fourth bar, and at the widest views every sixteenth (the longest a section may be).
   * They are counted from the grid's first bar.
   */
  /** Divisions to a beat the grid shows at this zoom: 4 (sixteenths), 2, 1 (beats), or 0 for bar lines only (chopper mode goes to sixteenths; acapella and synced mode to beats). */
  const divisionAt = (g: TapGrid, span: number, widthPx: number): number => {
    if (!latest.current.fine && !latest.current.beatGrid) return 0;
    const beatPx = (g.segments[0].beatFrames * widthPx) / span;
    // Outside chopper mode the finest the grid goes is a single beat.
    if (!latest.current.fine) return beatPx >= MIN_STEP_PX ? 1 : 0;
    return beatPx / 4 >= MIN_STEP_PX ? 4 : beatPx / 2 >= MIN_STEP_PX ? 2 : beatPx >= MIN_STEP_PX ? 1 : 0;
  };

  const gridLines = (g: TapGrid, from: number, to: number, span: number, widthPx: number): number[] => {
    const d = divisionAt(g, span, widthPx);
    if (d > 0) {
      const beat = g.segments[0].beatFrames;
      const lo = Math.max(0, from);
      const hi = Math.min(total, to);
      const out: number[] = [];
      for (const n of linesBetween(g, lo - beat, hi + beat)) {
        for (let j = 0; j < d; j++) {
          const m = n + j / d;
          const frame = lineFrame(g, m);
          if (frame >= lo && frame <= hi) out.push(m);
        }
      }
      return out;
    }
    const barPx = (g.segments[0].beatFrames * g.beatsPerBar * widthPx) / span;
    const every = barPx >= MIN_BAR_PX ? 1 : barPx * 4 >= MIN_BAR_PX ? 4 : MAX_SECTION_BARS;
    const ref = g.downbeats[0] ?? 0;
    return linesBetween(g, Math.max(0, from), Math.min(total, to)).filter((n) => isBarLine(g, n) && ((((n - ref) / g.beatsPerBar) % every) + every) % every === 0);
  };

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(el.clientWidth * ratio));
    const h = Math.max(1, Math.round(el.clientHeight * ratio));
    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const ink = getComputedStyle(el).color;
    const { grid: g, chops: cuts, downbeats: downs, oneOne: one111, sections: bin } = latest.current;
    const { cursor, span } = view.current;
    const start = cursor - span / 2;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const flag = FLAG_H * ratio;
    const bottom = h - flag;
    const mid = (flag + bottom) / 2;
    const perFrame = w / span;
    const xOf = (frame: number) => (frame - start) * perFrame;
    const one = Math.max(1, Math.round(ratio));

    // The sections, shaded in their colours.
    for (const s of bin) {
      const x0 = Math.max(0, xOf(s.start));
      const x1 = Math.min(w, xOf(s.end));
      if (x1 <= x0) continue;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x0, flag, x1 - x0, bottom - flag);
    }
    ctx.globalAlpha = 1;

    // The waveform, one full-resolution column per device pixel.
    const columns = w;
    if (buffers.current.lo.length !== columns) buffers.current = { lo: new Float32Array(columns), hi: new Float32Array(columns) };
    const { lo, hi } = buffers.current;
    columnPeaks(pyramid, start, span, columns, lo, hi);
    const scale = pyramid.peak > 0 ? (((bottom - flag) / 2) * 0.94) / pyramid.peak : 0;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(0, Math.floor(mid), w, one);
    ctx.globalAlpha = 1;
    for (let col = 0; col < columns; col++) {
      const top = mid - hi[col] * scale;
      const low = mid - lo[col] * scale;
      ctx.fillRect(col, top, 1, Math.max(1, low - top));
    }

    // The grid's lines: beats light, the first beat of each bar stronger. Too close together and the beats go first, then the bars.
    if (g) {
      for (const n of gridLines(g, start, start + span, span, w / ratio)) {
        ctx.fillStyle = ink;
        // Bar lines strongest, beats lighter, the sixteenths and eighths between them lightest and thinnest.
        ctx.globalAlpha = !Number.isInteger(n) ? 0.28 : divisionAt(g, span, w / ratio) > 0 && !isBarLine(g, n) ? 0.45 : 0.6;
        const thick = Number.isInteger(n) ? Math.max(2, Math.round(1.5 * ratio)) : Math.max(1, Math.round(ratio));
        ctx.fillRect(Math.round(xOf(lineFrame(g, n))) - Math.floor(thick / 2), flag, thick, bottom - flag);
      }
      ctx.globalAlpha = 1;
    }

    ctx.font = `${Math.round(8 * ratio)}px Silkscreen, monospace`;
    ctx.textBaseline = "middle";

    // Downbeat markers (a flag below the waveform reading 1) and the 1.1.1 (the same, reading 1.1.1).
    ctx.textAlign = "center";
    const downFlag = (frame: number, text: string) => {
      const x = Math.round(xOf(frame));
      const fw = (text.length * 5 + 8) * ratio;
      if (x < -fw || x > w + fw) return;
      ctx.fillStyle = ink;
      ctx.globalAlpha = 1;
      ctx.fillRect(x - one, flag, 2 * one, bottom - flag);
      ctx.fillRect(x - fw / 2, bottom, fw, flag);
      ctx.fillStyle = "#000";
      ctx.fillText(text, x, bottom + flag / 2 + ratio);
    };
    for (const frame of downs) downFlag(frame, "1");
    if (one111 !== null) downFlag(one111, "ANCHOR");

    // Chop markers: a line in the colour of the section that starts there (the last one takes the colour of the section it ends), a numbered flag on top.
    cuts.forEach((frame, i) => {
      const x = Math.round(xOf(frame));
      if (x < -20 * ratio || x > w + 20 * ratio) return;
      const colour = bin[Math.min(i, bin.length - 1)]?.color ?? ink;
      ctx.fillStyle = colour;
      ctx.globalAlpha = 1;
      ctx.fillRect(x - one, flag, 2 * one, bottom - flag);
      const fw = (String(i + 1).length * 5 + 8) * ratio;
      ctx.fillRect(x - fw / 2, 0, fw, flag);
      ctx.fillStyle = "#000";
      ctx.fillText(String(i + 1), x, flag / 2 + ratio);
    });

    // The cursor: a line the whole height, fixed in the middle.
    const cx = Math.round(w / 2);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 1;
    ctx.fillRect(cx - one, 0, Math.max(2, Math.round(2 * ratio)), h);
    const half = 5 * ratio;
    ctx.beginPath();
    ctx.moveTo(cx - half, flag);
    ctx.lineTo(cx + half, flag);
    ctx.lineTo(cx, flag + 7 * ratio);
    ctx.closePath();
    ctx.fill();

    if (time.current) time.current.textContent = formatTime(cursor / sampleRate);
  }, [pyramid, sampleRate, total]);

  useLayoutEffect(draw);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);

  const setCursor = useCallback(
    (frame: number) => {
      view.current = { cursor: Math.min(total, Math.max(0, frame)), span: view.current.span };
      draw();
    },
    [total, draw],
  );

  useImperativeHandle(
    ref,
    () => ({
      cursor: () => view.current.cursor,
      // A jump made by hand ends any glide still running from the last release.
      setCursor: (frame) => {
        cancelAnimationFrame(settling.current);
        setCursor(frame);
      },
      snap: () => (snapping() ? settle() : null),
      snapping,
      division: () => (latest.current.grid && canvas.current ? divisionAt(latest.current.grid, view.current.span, canvas.current.clientWidth) : 0),
    }),
    [setCursor],
  );

  const across = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelAnimationFrame(settling.current);
    trail.current = [];
    if (drag.current) return;
    const { cursor, span } = view.current;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, y0: e.clientY, moved: false, pivot: cursor - span / 2 + across(e.clientX) * span, span };
  };

  /** The drawn grid line just before a frame and the one just after it (infinite where there is none): where the snap can go. */
  const bounds = (frame: number, span: number): { before: number; after: number } => {
    const g = latest.current.grid;
    let before = -Infinity;
    let after = Infinity;
    if (!g) return { before, after };
    // far enough either side to find a neighbour at the coarsest step
    const reach = Math.max(span * 2, g.segments[0].beatFrames * g.beatsPerBar * MAX_SECTION_BARS * 3);
    for (const n of gridLines(g, frame - reach, frame + reach, span, canvas.current!.clientWidth)) {
      const t = lineFrame(g, n);
      if (t <= frame && t > before) before = t;
      if (t > frame && t < after) after = t;
    }
    return { before, after };
  };

  /** Letting go with the magnet on: the line glides onto the nearest bar line. */
  const settle = (): number | null => {
    cancelAnimationFrame(settling.current);
    const { span } = view.current;
    const { before, after } = bounds(view.current.cursor, span);
    const here = view.current.cursor;
    const target = Math.abs(here - before) <= Math.abs(after - here) ? before : after;
    if (!Number.isFinite(target)) return null;
    let last = performance.now();
    const step = (now: number) => {
      const next = approach(view.current.cursor, target, now - last);
      last = now;
      const done = Math.abs(next - target) < Math.max(1, view.current.span / 4000);
      setCursor(done ? target : next);
      if (!done) settling.current = requestAnimationFrame(step);
    };
    settling.current = requestAnimationFrame(step);
    return target;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    if (!d.moved) {
      if (!isDrag(e.clientX - d.startX, e.clientY - d.startY)) return;
      d.moved = true;
      // Pin what is under the finger now, so the waveform does not jump by the distance the tap threshold swallowed.
      d.span = view.current.span;
      d.y0 = e.clientY;
      d.pivot = view.current.cursor - d.span / 2 + across(e.clientX) * d.span;
      latest.current.onScrub();
    }
    // Ableton style: sideways drags the waveform, and the point under the finger stays under it. Vertical travel from where the drag began zooms at once:
    // up zooms out straight away, down zooms in with a smooth start (eased in, then the same pace as up). The zoom stays where it was left on release.
    const rect = canvas.current!.getBoundingClientRect();
    const dy = e.clientY - d.y0;
    const outside = dy > 0 ? (dy * dy) / (dy + ZOOM_EASE_PX) : dy;
    const resting = Math.max(d.span, Math.min(total, START_SECONDS * sampleRate));
    const rate = zoomRate(resting, zoomRoom(rect.bottom, window.innerHeight), minSpan);
    const span = spanAfterDrag(d.span, outside, rate, total, minSpan);
    const start = viewUnderFinger(d.pivot, across(e.clientX), span);
    // The line stays in the middle and follows the finger freely; the snap comes when the finger lets go.
    view.current = { cursor: view.current.cursor, span };
    inFreeMode();
    const raw = Math.min(total, Math.max(0, start + span / 2));
    setCursor(raw);
    const now = performance.now();
    trail.current = [...trail.current.filter((p) => now - p.t < 100), { t: now, cursor: raw }];
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    const resumed = latest.current.onScrubEnd();
    if (resumed) return;
    const settleAfter = () => {
      if (snapping()) settle();
    };
    // Momentum: carry on at the speed the waveform was moving, slowing to a stop. The zoom stays as it was left.
    const now = performance.now();
    const first = trail.current[0];
    const last = trail.current[trail.current.length - 1];
    trail.current = [];
    // Fully zoomed in the line is being placed exactly: it stays where the finger left it, with no momentum.
    if (inFreeMode()) return;
    if (!first || !last || last === first || now - last.t > COAST_STALE_MS) return settleAfter();
    const speed = (last.cursor - first.cursor) / (last.t - first.t);
    const tau = snapping() ? COAST_SNAP_TAU_MS : COAST_TAU_MS;
    let v = speed;
    let prev = now;
    cancelAnimationFrame(settling.current);
    const glide = (t: number) => {
      const dt = Math.min(50, t - prev);
      prev = t;
      const before = view.current.cursor;
      setCursor(before + v * dt);
      v *= Math.exp(-dt / tau);
      const atEdge = view.current.cursor === before && v !== 0;
      if ((Math.abs(v) * (canvas.current?.clientWidth ?? 1)) / view.current.span < 0.02 || atEdge) return settleAfter();
      settling.current = requestAnimationFrame(glide);
    };
    settling.current = requestAnimationFrame(glide);
  };

  useEffect(() => () => cancelAnimationFrame(settling.current), []);

  return (
    <div className="chop-timeline">
      <canvas
        ref={canvas}
        className="chop-timeline__canvas"
        aria-label="Song waveform: scroll it under the line"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="chop-timeline__bar">
        <span ref={time} className="chop-timeline__range" />
      </div>
    </div>
  );
});
