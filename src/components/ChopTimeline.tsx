import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { approach, isDrag, spanAfterDrag, viewUnderFinger, zoomRate, zoomRoom, zoomTravel } from "../audio/song/zoom";
import { pulledBetween } from "../audio/song/chopMarks";
import { isBarLine, lineFrame, linesBetween, type TapGrid } from "../audio/song/tapGrid";

/** Lines closer together than this (CSS pixels) are not drawn (beats first, then bars). */
const MIN_LINE_PX = 7;
/** Height (CSS pixels) of the strip along the top that carries the chop flags, and of the one along the bottom that carries the downbeat flags. */
const FLAG_H = 14;
/** The closest view, in seconds across. */
const MIN_SPAN_SECONDS = 0.25;
/** A bar narrower than this on the screen (CSS pixels) is too small to snap to alone: the magnet then takes every fourth bar. */
const MAGNET_BAR_PX = 30;
/** How much of the song the first view shows, in seconds. */
const START_SECONDS = 12;

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
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return `${m}:${(Math.max(0, seconds) - m * 60).toFixed(2).padStart(5, "0")}`;
}

/**
 * The song's waveform in the screen's colours, scrolling behind a line fixed in the middle: that line is the cursor, where markers are put and where
 * the song plays from. Dragging scrubs (the waveform follows the finger, and the line is pulled toward the bar lines, smoothly), and dragging down zooms in, up zooms out. Over it: a line for every beat (the first beat of each bar
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
  }
>(function ChopTimeline({ pyramid, sampleRate, grid, chops, downbeats, oneOne, sections, magnetOn, onScrub }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const total = pyramid.totalFrames;
  const latest = useRef({ grid, chops, downbeats, oneOne, sections, magnetOn, onScrub });
  latest.current = { grid, chops, downbeats, oneOne, sections, magnetOn, onScrub };
  const initialSpan = Math.min(total, START_SECONDS * sampleRate);
  const view = useRef({ cursor: 0, span: initialSpan });
  const drag = useRef<{ id: number; startX: number; startY: number; moved: boolean; pivot: number; span: number; y0: number; room: number } | null>(null);
  const settling = useRef(0);
  const buffers = useRef({ lo: new Float32Array(0), hi: new Float32Array(0) });
  const minSpan = Math.min(total, MIN_SPAN_SECONDS * sampleRate);

  /** The lines shown at this zoom: every beat, or only the bars when the beats are too close together, or none. */
  const shownLines = (g: TapGrid, start: number, span: number, widthPx: number): number[] => {
    const beatPx = (g.segments[0].beatFrames * widthPx) / span;
    const lines = linesBetween(g, Math.max(0, start), Math.min(total, start + span));
    return beatPx >= MIN_LINE_PX ? lines : beatPx * g.beatsPerBar >= MIN_LINE_PX ? lines.filter((n) => isBarLine(g, n)) : [];
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
      for (const n of shownLines(g, start, span, w / ratio)) {
        const bar = isBarLine(g, n);
        ctx.fillStyle = ink;
        ctx.globalAlpha = bar ? 0.6 : 0.2;
        const thick = bar ? Math.max(2, Math.round(1.5 * ratio)) : one;
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
    if (one111 !== null) downFlag(one111, "1.1.1");

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

  useImperativeHandle(ref, () => ({ cursor: () => view.current.cursor, setCursor }), [setCursor]);

  const across = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelAnimationFrame(settling.current);
    if (drag.current) return;
    const { cursor, span } = view.current;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, pivot: cursor - span / 2 + across(e.clientX) * span, span, y0: e.clientY, room: zoomRoom(e.clientY, window.innerHeight) };
  };

  /**
   * The grid lines the magnet pulls toward: bar lines only, every bar when a bar is wide enough on the screen to tell apart, otherwise every fourth bar
   * (counted from the first bar of the grid). Never finer than a bar.
   */
  const bounds = (frame: number, span: number): { before: number; after: number } => {
    const g = latest.current.grid;
    let before = -Infinity;
    let after = Infinity;
    if (!g) return { before, after };
    const barFrames = g.segments[0].beatFrames * g.beatsPerBar;
    const every = (barFrames * canvas.current!.clientWidth) / span >= MAGNET_BAR_PX ? 1 : 4;
    const reach = Math.max(span * 2, barFrames * every * 3);
    const ref = g.downbeats[0] ?? 0;
    for (const n of linesBetween(g, Math.max(0, frame - reach), Math.min(total, frame + reach))) {
      if (!isBarLine(g, n) || ((((n - ref) / g.beatsPerBar) % every) + every) % every !== 0) continue;
      const t = lineFrame(g, n);
      if (t <= frame && t > before) before = t;
      if (t > frame && t < after) after = t;
    }
    return { before, after };
  };

  /**
   * The magnet while the finger drags: the line is drawn at a spot pulled toward the grid line or marker on either side of the finger. Between two
   * neighbours the position eases through a steep double smoothstep, so the line clings to each one (the pull is strongest on top of it and fades
   * gradually) and slides across the gap in the middle. It is continuous and never goes backwards, and no stretch of the song is without a pull.
   */
  const magnet = (frame: number, span: number): number => {
    const { before, after } = bounds(frame, span);
    if (before === -Infinity || after === Infinity) return frame;
    return pulledBetween(frame, before, after);
  };

  /** Letting go with the magnet on: the line glides the rest of the way onto the nearest grid line or marker. */
  const settle = () => {
    cancelAnimationFrame(settling.current);
    const { span } = view.current;
    const { before, after } = bounds(view.current.cursor, span);
    const here = view.current.cursor;
    const target = Math.abs(here - before) <= Math.abs(after - here) ? before : after;
    if (!Number.isFinite(target)) return;
    let last = performance.now();
    const step = (now: number) => {
      const next = approach(view.current.cursor, target, now - last);
      last = now;
      const done = Math.abs(next - target) < Math.max(1, view.current.span / 4000);
      setCursor(done ? target : next);
      if (!done) settling.current = requestAnimationFrame(step);
    };
    settling.current = requestAnimationFrame(step);
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
      d.pivot = view.current.cursor - d.span / 2 + across(e.clientX) * d.span;
      d.y0 = e.clientY;
      d.room = zoomRoom(e.clientY, window.innerHeight);
      latest.current.onScrub();
    }
    // Ableton style: sideways drags the waveform, and the point under the finger stays under it; dragging down zooms in and up zooms out, the same
    // ratio for every equal step, once the finger has passed a small dead zone.
    const resting = Math.max(d.span, Math.min(total, START_SECONDS * sampleRate));
    const rate = zoomRate(resting, d.room, minSpan);
    const span = spanAfterDrag(d.span, zoomTravel(e.clientY - d.y0), rate, total, minSpan);
    const start = viewUnderFinger(d.pivot, across(e.clientX), span);
    // The line stays in the middle; it is pulled onto the nearest grid line or marker when one is close.
    view.current = { cursor: view.current.cursor, span };
    const raw = Math.min(total, Math.max(0, start + span / 2));
    setCursor(latest.current.magnetOn ? magnet(raw, span) : raw);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved && latest.current.magnetOn) settle();
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
