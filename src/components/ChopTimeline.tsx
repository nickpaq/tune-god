import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { defaultSpan, dragStep, spanAt, viewStart, zoomDepth, zoomRoom, type GrabbedView } from "../audio/song/zoom";

/** Size of a chop point's tab, in CSS pixels: wide enough for a thumb, and its top comes to a point. */
const TAB_WIDTH = 28;
const TAB_HEIGHT = 34;
const TAB_TIP = 12;
/** Room left at each side of the waveform so a tab at the very start or end of the song is drawn whole. */
const INSET = TAB_WIDTH / 2 + 2;
/** How long the view takes to ease back out after a tab is let go. */
const RETURN_MS = 320;

interface TabDrag {
  kind: "tab";
  id: number;
  /** Position in `cuts` of the grabbed tab. */
  cut: number;
  startY: number;
  lastX: number;
  room: number;
  /** The span the view had when the tab was grabbed: the zoom a drag goes in from and a release returns to. */
  resting: number;
  grab: GrabbedView;
}

interface PanDrag {
  kind: "pan";
  id: number;
  lastX: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return `${m}:${(Math.max(0, seconds) - m * 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * The song's waveform at full quality, in the screen's colours, with every chop point as a tab along the bottom (its top comes to a
 * point). The view rests at about half the song. Grab a tab and drag down to zoom in, smoothly, while sideways travel moves the point
 * by less and less time; let go and the point stays where it was put while the view eases back out. Dragging anywhere else pans.
 */
export function ChopTimeline({
  pyramid,
  sampleRate,
  cuts,
  selected,
  gridOrigin,
  beatFrames,
  beatsPerBar,
  onMoveCut,
  onReleaseCut,
  onSelect,
}: {
  pyramid: PeakPyramid;
  sampleRate: number;
  /** Every cut, in order: the frame each section starts at. */
  cuts: number[];
  selected: number;
  /** Frame of bar 1 beat 1 and frames per beat, for the beat lines that appear as the view zooms in. */
  gridOrigin: number;
  beatFrames: number;
  beatsPerBar: number;
  onMoveCut: (cut: number, frame: number) => void;
  /** A tab was let go: the cut is final for this drag. */
  onReleaseCut: (cut: number) => void;
  onSelect: (cut: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const range = useRef<HTMLSpanElement>(null);
  const latest = useRef({ cuts, selected, gridOrigin, beatFrames, beatsPerBar, onMoveCut, onReleaseCut, onSelect });
  latest.current = { cuts, selected, gridOrigin, beatFrames, beatsPerBar, onMoveCut, onReleaseCut, onSelect };
  const total = pyramid.totalFrames;
  const resting = defaultSpan(total);
  const view = useRef({ start: 0, span: resting });
  const drag = useRef<TabDrag | PanDrag | null>(null);
  const returning = useRef(0);
  const buffers = useRef({ lo: new Float32Array(0), hi: new Float32Array(0) });

  const clampStart = useCallback((start: number, span: number) => Math.min(Math.max(0, start), Math.max(0, total - span)), [total]);

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
    const { cuts: cutList, selected: chosen, gridOrigin: origin, beatFrames: beat, beatsPerBar: perBar } = latest.current;
    const { start, span } = view.current;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const inset = INSET * ratio;
    const inner = Math.max(1, w - 2 * inset);
    const tabHeight = TAB_HEIGHT * ratio;
    const plotHeight = h - tabHeight;
    const mid = plotHeight / 2;

    // The waveform itself, one full-resolution column per device pixel.
    if (buffers.current.lo.length !== inner) buffers.current = { lo: new Float32Array(inner), hi: new Float32Array(inner) };
    const { lo, hi } = buffers.current;
    columnPeaks(pyramid, start, span, inner, lo, hi);
    const scale = pyramid.peak > 0 ? (mid * 0.94) / pyramid.peak : 0;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(inset, Math.floor(mid), inner, Math.max(1, Math.round(ratio)));
    ctx.globalAlpha = 1;
    for (let c = 0; c < inner; c++) {
      const top = mid - hi[c] * scale;
      const bottom = mid - lo[c] * scale;
      ctx.fillRect(inset + c, top, 1, Math.max(1, bottom - top));
    }

    // Beat and bar lines, once the view is close enough for them to be apart.
    const perFrame = inner / span;
    const beatPx = beat * perFrame;
    if (beat > 0 && beatPx >= 7 * ratio) {
      ctx.fillStyle = ink;
      for (let n = Math.ceil((start - origin) / beat); origin + n * beat <= start + span; n++) {
        const bar = ((n % perBar) + perBar) % perBar === 0;
        if (!bar && beatPx < 12 * ratio) continue;
        ctx.globalAlpha = bar ? 0.4 : 0.16;
        ctx.fillRect(Math.round(inset + (origin + n * beat - start) * perFrame), 0, Math.max(1, Math.round(ratio)), plotHeight);
      }
    }
    ctx.globalAlpha = 1;

    // The chop points: a line up the waveform and a tab at the bottom with a pointed top. The chosen one is drawn last, and hollow.
    const drawTab = (i: number) => {
      const frame = (drag.current?.kind === "tab" && drag.current.cut === i ? drag.current.grab.frame : cutList[i]) as number;
      const x = inset + (frame - start) * perFrame;
      const half = (TAB_WIDTH / 2) * ratio;
      if (x < -half || x > w + half) return;
      const on = i === chosen;
      const line = Math.max(1, Math.round(ratio * (on ? 2 : 1)));
      ctx.fillStyle = ink;
      ctx.globalAlpha = on ? 1 : 0.75;
      ctx.fillRect(Math.round(x - line / 2), 0, line, plotHeight);
      ctx.globalAlpha = 1;
      const tip = TAB_TIP * ratio;
      ctx.beginPath();
      ctx.moveTo(x, plotHeight);
      ctx.lineTo(x + half, plotHeight + tip);
      ctx.lineTo(x + half, h - 1);
      ctx.lineTo(x - half, h - 1);
      ctx.lineTo(x - half, plotHeight + tip);
      ctx.closePath();
      if (on) {
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2 * ratio;
        ctx.stroke();
      } else {
        ctx.fillStyle = ink;
        ctx.fill();
      }
      ctx.fillStyle = on ? ink : "#000";
      ctx.font = `${Math.round(8 * ratio)}px Silkscreen, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x, plotHeight + tip + (tabHeight - tip) / 2);
    };
    for (let i = 0; i < cutList.length; i++) if (i !== chosen) drawTab(i);
    if (chosen >= 0 && chosen < cutList.length) drawTab(chosen);

    if (range.current) range.current.textContent = `${formatTime(start / sampleRate)} - ${formatTime((start + span) / sampleRate)}`;
  }, [pyramid, sampleRate]);

  // Draws after every render (the cuts or the grid may have moved) and whenever the canvas is resized.
  useLayoutEffect(draw);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);
  useEffect(() => () => cancelAnimationFrame(returning.current), []);

  // Choosing a cut from outside (the nudge buttons, a new song) brings it into view.
  const chosenFrame = cuts[selected];
  useEffect(() => {
    if (drag.current || chosenFrame === undefined) return;
    const { start, span } = view.current;
    if (chosenFrame < start || chosenFrame > start + span) {
      view.current = { start: clampStart(chosenFrame - span / 2, span), span };
      draw();
    }
  }, [selected, chosenFrame, clampStart, draw]);

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, height: rect.height };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelAnimationFrame(returning.current);
    const { x, y, width: full, height } = pointer(e);
    const width = full - 2 * INSET;
    const { start, span } = view.current;
    const { cuts: cutList } = latest.current;
    // The tab whose point is nearest the finger, if the finger is down in the tabs.
    let hit = -1;
    let best = Infinity;
    cutList.forEach((frame, i) => {
      const distance = Math.abs(INSET + ((frame - start) / span) * width - x);
      if (y >= height - TAB_HEIGHT - 6 && distance <= TAB_WIDTH / 2 + 4 && distance < best) {
        best = distance;
        hit = i;
      }
    });
    if (hit >= 0) {
      latest.current.onSelect(hit);
      drag.current = {
        kind: "tab",
        id: e.pointerId,
        cut: hit,
        startY: e.clientY,
        lastX: e.clientX,
        room: zoomRoom(e.clientY, window.innerHeight),
        resting: span,
        grab: { frame: cutList[hit], across: (cutList[hit] - start) / span, span },
      };
    } else drag.current = { kind: "pan", id: e.pointerId, lastX: e.clientX };
    draw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const width = pointer(e).width - 2 * INSET;
    if (d.kind === "pan") {
      const { start, span } = view.current;
      view.current = { start: clampStart(start - ((e.clientX - d.lastX) / width) * span, span), span };
      d.lastX = e.clientX;
      return draw();
    }
    // Further down, closer in. The point stays under the finger and a pixel of travel covers less time the closer the view is.
    const span = spanAt(zoomDepth(e.clientY - d.startY, d.room), d.resting);
    const next = dragStep(d.grab, e.clientX - d.lastX, width, span);
    d.lastX = e.clientX;
    next.frame = Math.min(total, Math.max(0, next.frame));
    d.grab = next;
    view.current = { start: viewStart(next), span };
    latest.current.onMoveCut(d.cut, Math.round(next.frame));
    draw();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.kind !== "tab") return;
    latest.current.onReleaseCut(d.cut);
    // The point stays where it was put; the view eases back out around it, keeping it at the same place across the screen.
    const from = view.current.span;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / RETURN_MS);
      const eased = 1 - (1 - t) ** 3;
      const span = from * Math.pow(d.resting / from, eased);
      view.current = { start: clampStart(d.grab.frame - d.grab.across * span, span), span };
      draw();
      if (t < 1) returning.current = requestAnimationFrame(step);
    };
    returning.current = requestAnimationFrame(step);
  };

  const page = (direction: number) => {
    const { start, span } = view.current;
    view.current = { start: clampStart(start + direction * span * 0.5, span), span };
    draw();
  };

  return (
    <div className="chop-timeline">
      <canvas
        ref={canvas}
        className="chop-timeline__canvas"
        aria-label="Song waveform with the chop points"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="chop-timeline__bar">
        <button className="chop__btn" onClick={() => page(-1)} aria-label="Earlier in the song">
          ◀
        </button>
        <span ref={range} className="chop-timeline__range" />
        <button className="chop__btn" onClick={() => page(1)} aria-label="Later in the song">
          ▶
        </button>
      </div>
    </div>
  );
}
