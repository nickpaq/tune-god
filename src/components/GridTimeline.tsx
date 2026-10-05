import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { clampViewStart, isDrag, viewUnderFinger } from "../audio/song/zoom";
import { isBarLine, lineFrame, linesBetween, type TapGrid } from "../audio/song/tapGrid";

/** Room left at each side of the waveform so a line at the very start or end of the song is drawn whole. */
const INSET = 10;
/** Lines closer together than this (CSS pixels) are not drawn (beats first, then bars) and cannot be picked. */
const MIN_LINE_PX = 7;
/** How near (CSS pixels) a tap has to land to a line to pick it. */
const PICK_PX = 18;
/** Dragging a section out: within this many pixels of the edge the view runs on by itself, at up to a view's width in this many seconds. */
const EDGE_PX = 36;
const EDGE_SECONDS = 1.6;
/** The closest view, in beats across. */
const MIN_BEATS_ACROSS = 2;
const FLAG_H = 14;

export type TimelineMode = "view" | "pick" | "adjust" | "drag";

export interface TapMark {
  frame: number;
  /** A tap that was thrown out as a stray hit. */
  ignored: boolean;
}

export interface GridTimelineHandle {
  /** Moves the playhead to a frame (null takes it away). With `follow` the view keeps it in the middle. */
  setPlayhead: (frame: number | null, follow: boolean) => void;
  /** The frame in the middle of the view. */
  centre: () => number;
  centreOn: (frame: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return `${m}:${(Math.max(0, seconds) - m * 60).toFixed(1).padStart(4, "0")}`;
}

interface Drag {
  id: number;
  startX: number;
  startY: number;
  moved: boolean;
  pivot: number;
  /** In drag mode: the line the section starts from. */
  from: number;
  /** Where the finger is, for the view running on at an edge. */
  x: number;
  raf: number;
  last: number;
}

/**
 * The song's waveform in the screen's colours with the tapped grid over it: a line for every beat (the first beat of each bar stronger, once bar 1 has
 * been picked), the picked cuts numbered along the top, the sections between them shaded, and the marks of the taps made. What a touch does depends on `mode`:
 * `view` pans; `pick` taps a line to cut there (or take the cut away); `adjust` taps a line to choose it; `drag` drags out a section from one line to another.
 * Dragging anywhere else pans, except in `drag` mode. The buttons below pan and zoom.
 */
export const GridTimeline = forwardRef<
  GridTimelineHandle,
  {
    pyramid: PeakPyramid;
    sampleRate: number;
    grid: TapGrid;
    /** False until there is a tempo to draw lines from. */
    showGrid: boolean;
    /** The picked cuts, as line numbers in order. */
    cuts: number[];
    /** The rest of the song after the last cut is a section too. */
    tail: boolean;
    selectedLine: number | null;
    mode: TimelineMode;
    taps?: TapMark[];
    /** The frame the view starts centred on. */
    startFrame: number;
    /** A line was tapped (its number), or empty space (null). */
    onLine: (line: number | null) => void;
    /** A section was dragged out from one line to another. */
    onSpan: (first: number, last: number) => void;
  }
>(function GridTimeline({ pyramid, sampleRate, grid, showGrid, cuts, tail, selectedLine, mode, taps, startFrame, onLine, onSpan }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const range = useRef<HTMLSpanElement>(null);
  const total = pyramid.totalFrames;
  const latest = useRef({ grid, showGrid, cuts, tail, selectedLine, mode, taps, onLine, onSpan });
  latest.current = { grid, showGrid, cuts, tail, selectedLine, mode, taps, onLine, onSpan };
  const initialSpan = Math.min(total, grid.beatFrames * grid.beatsPerBar * 8);
  const view = useRef({ start: startFrame - initialSpan / 2, span: initialSpan });
  const playhead = useRef<{ frame: number } | null>(null);
  /** The view runs with the playhead, so a finger cannot pan it. */
  const playheadFollows = useRef(false);
  const drag = useRef<Drag | null>(null);
  /** The section being dragged out: its first and last line. */
  const preview = useRef<{ a: number; b: number } | null>(null);
  const buffers = useRef({ lo: new Float32Array(0), hi: new Float32Array(0) });

  const minSpan = () => Math.max(60, latest.current.grid.beatFrames * MIN_BEATS_ACROSS);
  const clamp = useCallback((start: number, span: number) => clampViewStart(start, span, total), [total]);

  /** The lines drawn at the current zoom: every beat, or only the bars when the beats are too close, or none. */
  const drawnLines = (start: number, span: number, widthPx: number): number[] => {
    const { grid: g, cuts: c, showGrid: shown } = latest.current;
    if (!shown) return [];
    const beatPx = (g.beatFrames * widthPx) / span;
    if (beatPx >= MIN_LINE_PX) return linesBetween(g, start, start + span);
    if (c.length > 0 && beatPx * g.beatsPerBar >= MIN_LINE_PX) return linesBetween(g, start, start + span).filter((n) => isBarLine(g, n, c[0]));
    return [];
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
    const { grid: g, cuts: c, tail: restOfSong, selectedLine: chosen, taps: marks } = latest.current;
    const { start, span } = view.current;
    el.dataset.start = String(Math.round(start));
    el.dataset.span = String(Math.round(span));
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const inset = INSET * ratio;
    const inner = Math.max(1, w - 2 * inset);
    const flag = FLAG_H * ratio;
    const bottom = h - 10 * ratio; // room under the waveform for the tap marks
    const plotTop = flag;
    const mid = (plotTop + bottom) / 2;
    const perFrame = inner / span;
    const xOf = (frame: number) => inset + (frame - start) * perFrame;
    const one = Math.max(1, Math.round(ratio));

    // Sections between the cuts, shaded in turn so where one ends and the next begins can be seen.
    ctx.fillStyle = ink;
    const shade = (a: number, b: number, alpha: number) => {
      const x0 = Math.max(inset, xOf(a));
      const x1 = Math.min(inset + inner, xOf(b));
      if (x1 <= x0) return;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x0, plotTop, x1 - x0, bottom - plotTop);
    };
    for (let i = 0; i + 1 < c.length; i++) shade(lineFrame(g, c[i]), lineFrame(g, c[i + 1]), i % 2 === 0 ? 0.13 : 0.06);
    if (restOfSong && c.length > 0) shade(lineFrame(g, c[c.length - 1]), total, 0.04);
    const dragged = preview.current;
    if (dragged) shade(lineFrame(g, dragged.a), lineFrame(g, dragged.b), 0.3);

    // The waveform itself, one full-resolution column per device pixel.
    if (buffers.current.lo.length !== Math.floor(inner)) buffers.current = { lo: new Float32Array(Math.floor(inner)), hi: new Float32Array(Math.floor(inner)) };
    const { lo, hi } = buffers.current;
    const columns = lo.length;
    columnPeaks(pyramid, start, span, columns, lo, hi);
    const scale = pyramid.peak > 0 ? ((bottom - plotTop) / 2 * 0.94) / pyramid.peak : 0;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(inset, Math.floor(mid), inner, one);
    ctx.globalAlpha = 1;
    for (let col = 0; col < columns; col++) {
      const top = mid - hi[col] * scale;
      const low = mid - lo[col] * scale;
      ctx.fillRect(inset + col, top, 1, Math.max(1, low - top));
    }

    // The grid's lines: beats light, bars (counted from the first cut) stronger, the chosen line strongest.
    const barOne = c[0];
    for (const n of drawnLines(start, span, el.clientWidth - 2 * INSET)) {
      const x = Math.round(xOf(lineFrame(g, n)));
      const bar = isBarLine(g, n, barOne);
      const cut = c.includes(n);
      const picked = n === chosen;
      ctx.fillStyle = ink;
      ctx.globalAlpha = cut ? 1 : picked ? 0.95 : bar ? 0.5 : 0.2;
      const thick = cut || picked ? Math.max(2, Math.round(2 * ratio)) : one;
      ctx.fillRect(x - Math.floor(thick / 2), plotTop, thick, bottom - plotTop);
    }
    ctx.globalAlpha = 1;

    // Cuts: a numbered flag on the line. The chosen line gets a hollow diamond at the foot, so it can be told from a cut.
    ctx.font = `${Math.round(8 * ratio)}px Silkscreen, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    c.forEach((n, i) => {
      const x = xOf(lineFrame(g, n));
      if (x < inset - 12 * ratio || x > inset + inner + 12 * ratio) return;
      const half = Math.max(7 * ratio, (String(i + 1).length * 5 + 4) * ratio);
      ctx.fillStyle = ink;
      ctx.fillRect(x - half, 0, half * 2, flag);
      ctx.fillStyle = "#000";
      ctx.fillText(String(i + 1), x, flag / 2 + ratio);
    });
    if (chosen !== null) {
      const x = xOf(lineFrame(g, chosen));
      if (x >= 0 && x <= w) {
        const r = 5 * ratio;
        ctx.beginPath();
        ctx.moveTo(x, bottom - 2 * r);
        ctx.lineTo(x + r, bottom - r);
        ctx.lineTo(x, bottom);
        ctx.lineTo(x - r, bottom - r);
        ctx.closePath();
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2 * ratio;
        ctx.stroke();
      }
    }

    // The taps made: a tick under the waveform for each, hollow where the tap was thrown out.
    if (marks) {
      for (const m of marks) {
        const x = xOf(m.frame);
        if (x < inset || x > inset + inner) continue;
        ctx.fillStyle = ink;
        ctx.globalAlpha = 1;
        if (m.ignored) ctx.fillRect(Math.round(x) - ratio, bottom + 3 * ratio, 2 * ratio, 2 * ratio);
        else ctx.fillRect(Math.round(x) - one, bottom + 1, 2 * one, h - bottom - 1);
      }
    }

    // The playhead.
    const head = playhead.current;
    if (head) {
      const x = Math.round(xOf(head.frame));
      ctx.fillStyle = ink;
      ctx.globalAlpha = 1;
      ctx.fillRect(x - one, 0, Math.max(2, Math.round(2 * ratio)), bottom);
      const half = 5 * ratio;
      ctx.beginPath();
      ctx.moveTo(x - half, bottom);
      ctx.lineTo(x + half, bottom);
      ctx.lineTo(x, bottom - 7 * ratio);
      ctx.closePath();
      ctx.fill();
    }
    if (range.current) range.current.textContent = `${formatTime(start / sampleRate)} - ${formatTime((start + span) / sampleRate)}`;
  }, [pyramid, sampleRate, total]);

  useLayoutEffect(draw);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);

  const setView = (start: number, span: number) => {
    const s = Math.min(total, Math.max(minSpan(), span));
    view.current = { start: clamp(start, s), span: s };
    draw();
  };

  useImperativeHandle(ref, () => ({
    setPlayhead: (frame, follow) => {
      playhead.current = frame === null ? null : { frame };
      playheadFollows.current = frame !== null && follow;
      if (frame !== null && follow) view.current = { start: frame - view.current.span / 2, span: view.current.span };
      draw();
    },
    centre: () => view.current.start + view.current.span / 2,
    centreOn: (frame) => setView(frame - view.current.span / 2, view.current.span),
  }));

  const geometry = (e: { clientX: number }) => {
    const rect = canvas.current!.getBoundingClientRect();
    const width = rect.width - 2 * INSET;
    const x = e.clientX - rect.left;
    return { x, width, frame: view.current.start + ((x - INSET) / width) * view.current.span, across: (x - INSET) / width, rect };
  };

  /** The drawn line nearest a frame (any distance), with how far it is in pixels. */
  const nearestDrawn = (frame: number): { line: number; px: number } | null => {
    const { grid: g } = latest.current;
    const { start, span } = view.current;
    const width = canvas.current!.clientWidth - 2 * INSET;
    let best: number | null = null;
    let distance = Infinity;
    for (const n of drawnLines(start, span, width)) {
      const d = Math.abs(lineFrame(g, n) - frame);
      if (d < distance) {
        distance = d;
        best = n;
      }
    }
    return best === null ? null : { line: best, px: (distance / span) * width };
  };

  const edgeRun = (d: Drag) => {
    const step = (now: number) => {
      if (drag.current !== d) return;
      const rect = canvas.current!.getBoundingClientRect();
      const width = rect.width;
      const dt = Math.min(0.05, (now - d.last) / 1000);
      d.last = now;
      let speed = 0;
      if (d.x < EDGE_PX) speed = -(1 - Math.max(0, d.x) / EDGE_PX);
      else if (d.x > width - EDGE_PX) speed = 1 - Math.max(0, width - d.x) / EDGE_PX;
      if (speed !== 0) {
        const { start, span } = view.current;
        view.current = { start: clamp(start + speed * (span / EDGE_SECONDS) * dt, span), span };
        const frame = view.current.start + ((d.x - INSET) / (width - 2 * INSET)) * span;
        const end = nearestDrawn(frame);
        if (end) preview.current = { a: Math.min(d.from, end.line), b: Math.max(d.from, end.line) };
        draw();
      }
      d.raf = requestAnimationFrame(step);
    };
    d.raf = requestAnimationFrame(step);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (drag.current) return;
    const { frame } = geometry(e);
    const d: Drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, pivot: frame, from: 0, x: geometry(e).x, raf: 0, last: performance.now() };
    if (latest.current.mode === "drag") {
      const near = nearestDrawn(frame);
      if (near) {
        d.from = near.line;
        preview.current = { a: near.line, b: near.line };
        edgeRun(d);
      }
    }
    drag.current = d;
    draw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const g = geometry(e);
    d.x = g.x;
    if (!d.moved) {
      if (!isDrag(e.clientX - d.startX, e.clientY - d.startY)) return;
      d.moved = true;
      // Pin what is under the finger now, so the waveform does not jump by the distance the tap threshold swallowed.
      d.pivot = g.frame;
    }
    if (latest.current.mode === "drag") {
      const end = nearestDrawn(g.frame);
      if (preview.current && end) preview.current = { a: Math.min(d.from, end.line), b: Math.max(d.from, end.line) };
      return draw();
    }
    if (playhead.current && playheadFollows.current) return;
    const { span } = view.current;
    view.current = { start: clamp(viewUnderFinger(d.pivot, g.across, span), span), span };
    draw();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    cancelAnimationFrame(d.raf);
    const section = preview.current;
    preview.current = null;
    draw();
    if (cancelled) return;
    if (latest.current.mode === "drag" && d.moved && section && section.a !== section.b) return latest.current.onSpan(section.a, section.b);
    if (d.moved) return;
    // A tap: the line it landed near, or nothing.
    const near = nearestDrawn(geometry(e).frame);
    latest.current.onLine(near && near.px <= PICK_PX ? near.line : null);
  };

  const page = (direction: number) => setView(view.current.start + direction * view.current.span * 0.75, view.current.span);
  const zoom = (factor: number) => {
    const { start, span } = view.current;
    const about = playhead.current ? playhead.current.frame : start + span / 2;
    const next = Math.min(total, Math.max(minSpan(), span * factor));
    // The point zoomed about keeps its place across the view.
    const across = (about - start) / span;
    setView(about - across * next, next);
  };

  return (
    <div className="chop-timeline">
      <canvas
        ref={canvas}
        className="chop-timeline__canvas"
        aria-label="Song waveform with the grid"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerUp(e, false)}
        onPointerCancel={(e) => onPointerUp(e, true)}
      />
      <div className="chop-timeline__bar">
        <button className="chop__btn" onClick={() => page(-1)} aria-label="Earlier">
          ◀
        </button>
        <button className="chop__btn" onClick={() => zoom(2)} aria-label="Zoom out">
          −
        </button>
        <span ref={range} className="chop-timeline__range" />
        <button className="chop__btn" onClick={() => zoom(0.5)} aria-label="Zoom in">
          +
        </button>
        <button className="chop__btn" onClick={() => page(1)} aria-label="Later">
          ▶
        </button>
      </div>
    </div>
  );
});
