import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { clampViewStart, isDrag, viewUnderFinger } from "../audio/song/zoom";
import { isBarLine, limitEnd, lineFrame, linesBetween, type TapGrid } from "../audio/song/tapGrid";

/** Room left at each side of the waveform so a line at the very start or end of the song is drawn whole. */
const INSET = 14;
/** Lines closer together than this (CSS pixels) are not drawn (beats first, then bars) and cannot be picked. */
const MIN_LINE_PX = 7;
/** How near (CSS pixels) a tap has to land to a line to pick it. */
const PICK_PX = 18;
/** Dragging a section out: within this many pixels of the edge the view runs on by itself, at up to a view's width in this many seconds. */
const EDGE_PX = 36;
const EDGE_SECONDS = 1.6;
/** The closest view, in beats across. */
const MIN_BEATS_ACROSS = 2;
/** Height (CSS pixels) of the strip along the top that carries the flags, and of the one along the bottom that carries the selection's handles and the tap marks. */
const FLAG_H = 14;
const HANDLE_H = 26;
const HANDLE_W = 28;
/** Two taps this close together in time (ms) and place (px) are a double tap. */
const DOUBLE_TAP_MS = 380;
const DOUBLE_TAP_PX = 30;

export type TimelineMode = "view" | "select" | "adjust";

export interface TapMark {
  frame: number;
  /** A tap that was thrown out as a stray hit. */
  ignored: boolean;
}

export interface Selection {
  first: number;
  last: number;
}

/** A section already in the list, as it is drawn. */
export interface BinSection extends Selection {
  /** Its colour, from the selected palette. */
  color: string;
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

/** What a finger that is down is doing. */
interface Drag {
  id: number;
  kind: "pan" | "select" | "handle";
  startX: number;
  startY: number;
  moved: boolean;
  pivot: number;
  /** For a new selection: the line it was started from. For a handle: the line at the other end of the selection, which stays. */
  anchor: number;
  /** For a handle: which end is held. */
  which: "start" | "end";
  /** Where the finger is, for the view running on at an edge. */
  x: number;
  raf: number;
  last: number;
}

/**
 * The song's waveform in the screen's colours with the tapped grid over it: a line for every beat (the first beat of each bar stronger, from the
 * 1.1.1 that was set), the sections already in the list in their colours, and the section being picked in the colour it will take. In `select` mode
 * dragging picks a section from one line to another (never more than `maxBeats` long), its two handles can be dragged to move its ends (letting go of
 * one asks to play from there), and a double tap on it asks to put it in the list. A tap picks the line it lands near. In the other modes dragging pans.
 * The buttons under it page and zoom.
 */
export const GridTimeline = forwardRef<
  GridTimelineHandle,
  {
    pyramid: PeakPyramid;
    sampleRate: number;
    grid: TapGrid;
    /** False until there is a tempo to draw lines from. */
    showGrid: boolean;
    /** The sections in the list, in song order. */
    sections: BinSection[];
    /** The section being picked. */
    selection: Selection | null;
    /** The colour the section being picked will take. */
    selectionColor: string;
    /** The longest a section may be, in beats. */
    maxBeats: number;
    selectedLine: number | null;
    mode: TimelineMode;
    taps?: TapMark[];
    /** The frame the view starts centred on. */
    startFrame: number;
    /** A line was tapped (its number), or empty space (null). */
    onLine: (line: number | null) => void;
    /** The section being picked changed (dragged out, or an end dragged), or was taken away (null). */
    onSelect: (selection: Selection | null) => void;
    /** An end of the section being picked was let go: the song plays from there. */
    onHandleRelease: (which: "start" | "end") => void;
    /** The section being picked was double tapped. */
    onDoubleTap: () => void;
  }
>(function GridTimeline({ pyramid, sampleRate, grid, showGrid, sections, selection, selectionColor, maxBeats, selectedLine, mode, taps, startFrame, onLine, onSelect, onHandleRelease, onDoubleTap }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const range = useRef<HTMLSpanElement>(null);
  const total = pyramid.totalFrames;
  const latest = useRef({ grid, showGrid, sections, selection, selectionColor, maxBeats, selectedLine, mode, taps, onLine, onSelect, onHandleRelease, onDoubleTap });
  latest.current = { grid, showGrid, sections, selection, selectionColor, maxBeats, selectedLine, mode, taps, onLine, onSelect, onHandleRelease, onDoubleTap };
  const initialSpan = Math.min(total, grid.segments[0].beatFrames * grid.beatsPerBar * 8);
  const view = useRef({ start: startFrame - initialSpan / 2, span: initialSpan });
  const playhead = useRef<{ frame: number } | null>(null);
  /** The view runs with the playhead, so a finger cannot pan it. */
  const playheadFollows = useRef(false);
  const drag = useRef<Drag | null>(null);
  const lastTap = useRef({ time: 0, x: 0 });
  const buffers = useRef({ lo: new Float32Array(0), hi: new Float32Array(0) });

  const minSpan = () => Math.max(60, latest.current.grid.segments[0].beatFrames * MIN_BEATS_ACROSS);
  const clamp = useCallback((start: number, span: number) => clampViewStart(start, span, total), [total]);

  /** The lines drawn at the current zoom: every beat, or only the bars when the beats are too close, or none. */
  const drawnLines = (start: number, span: number, widthPx: number): number[] => {
    const { grid: g, showGrid: shown } = latest.current;
    if (!shown) return [];
    const beatPx = (g.segments[0].beatFrames * widthPx) / span;
    // Only lines on the song itself: a section cannot start before it or end after it.
    const all = linesBetween(g, Math.max(0, start), Math.min(total, start + span));
    if (beatPx >= MIN_LINE_PX) return all;
    if (g.downbeats.length > 0 && beatPx * g.beatsPerBar >= MIN_LINE_PX) return all.filter((n) => isBarLine(g, n));
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
    const { grid: g, sections: bin, selection: picked, selectionColor: pickColor, selectedLine: chosen, taps: marks } = latest.current;
    const { start, span } = view.current;
    el.dataset.start = String(Math.round(start));
    el.dataset.span = String(Math.round(span));
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const inset = INSET * ratio;
    const inner = Math.max(1, w - 2 * inset);
    const flag = FLAG_H * ratio;
    const handle = HANDLE_H * ratio;
    const bottom = h - handle; // the strip under the waveform: handles and tap marks
    const plotTop = flag;
    const mid = (plotTop + bottom) / 2;
    const perFrame = inner / span;
    const xOf = (frame: number) => inset + (frame - start) * perFrame;
    const one = Math.max(1, Math.round(ratio));

    // Sections: the ones in the list in their colours, the one being picked in the colour it will take.
    const shade = (a: number, b: number, color: string, alpha: number) => {
      const x0 = Math.max(inset, xOf(a));
      const x1 = Math.min(inset + inner, xOf(b));
      if (x1 <= x0) return;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x0, plotTop, x1 - x0, bottom - plotTop);
    };
    bin.forEach((s) => shade(lineFrame(g, s.first), lineFrame(g, s.last), s.color, 0.26));
    if (picked) shade(lineFrame(g, picked.first), lineFrame(g, picked.last), pickColor, 0.4);
    ctx.globalAlpha = 1;

    // The waveform itself, one full-resolution column per device pixel.
    const columns = Math.floor(inner);
    if (buffers.current.lo.length !== columns) buffers.current = { lo: new Float32Array(columns), hi: new Float32Array(columns) };
    const { lo, hi } = buffers.current;
    columnPeaks(pyramid, start, span, columns, lo, hi);
    const scale = pyramid.peak > 0 ? (((bottom - plotTop) / 2) * 0.94) / pyramid.peak : 0;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(inset, Math.floor(mid), inner, one);
    ctx.globalAlpha = 1;
    for (let col = 0; col < columns; col++) {
      const top = mid - hi[col] * scale;
      const low = mid - lo[col] * scale;
      ctx.fillRect(inset + col, top, 1, Math.max(1, low - top));
    }

    // The grid's lines: beats light, the first beat of each bar stronger, the chosen line strongest.
    for (const n of drawnLines(start, span, el.clientWidth - 2 * INSET)) {
      const x = Math.round(xOf(lineFrame(g, n)));
      const bar = isBarLine(g, n);
      const on = n === chosen;
      ctx.fillStyle = ink;
      ctx.globalAlpha = on ? 1 : bar ? 0.6 : 0.2;
      const thick = on ? Math.max(2, Math.round(2 * ratio)) : bar ? Math.max(2, Math.round(1.5 * ratio)) : one;
      ctx.fillRect(x - Math.floor(thick / 2), plotTop, thick, bottom - plotTop);
    }
    ctx.globalAlpha = 1;

    // Flags along the top: a section's number where it starts, in its colour, and "1.1.1" where a downbeat was set.
    ctx.font = `${Math.round(8 * ratio)}px Silkscreen, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const flagAt = (frame: number, text: string, fill: string) => {
      const x = xOf(frame);
      const width = (text.length * 5 + 6) * ratio;
      if (x + width < inset || x > inset + inner + width) return;
      ctx.fillStyle = fill;
      ctx.fillRect(x, 0, width, flag);
      ctx.fillStyle = "#000";
      ctx.fillText(text, x + 3 * ratio, flag / 2 + ratio);
    };
    bin.forEach((s, i) => flagAt(lineFrame(g, s.first), String(i + 1), s.color));
    for (const n of g.downbeats) flagAt(lineFrame(g, n), "1.1.1", ink);

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

    // The two ends of the section being picked: tabs with a pointed top, to be dragged.
    if (picked) {
      const half = (HANDLE_W / 2) * ratio;
      const tip = 9 * ratio;
      const tab = (frame: number, label: string) => {
        const x = xOf(frame);
        if (x < -half || x > w + half) return;
        ctx.fillStyle = pickColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(Math.round(x) - one, plotTop, 2 * one, bottom - plotTop);
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x + half, bottom + tip);
        ctx.lineTo(x + half, h - 1);
        ctx.lineTo(x - half, h - 1);
        ctx.lineTo(x - half, bottom + tip);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.textAlign = "center";
        ctx.fillText(label, x, bottom + tip + (handle - tip) / 2);
      };
      tab(lineFrame(g, picked.first), "S");
      tab(lineFrame(g, picked.last), "E");
    }

    // The taps made: a tick at the very bottom for each, a dot where the tap was thrown out.
    if (marks) {
      for (const m of marks) {
        const x = xOf(m.frame);
        if (x < inset || x > inset + inner) continue;
        ctx.fillStyle = ink;
        ctx.globalAlpha = 1;
        if (m.ignored) ctx.fillRect(Math.round(x) - ratio, h - 4 * ratio, 2 * ratio, 2 * ratio);
        else ctx.fillRect(Math.round(x) - one, h - 10 * ratio, 2 * one, 10 * ratio);
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
  }, [pyramid, sampleRate]);

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

  const geometry = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect();
    const width = rect.width - 2 * INSET;
    const x = e.clientX - rect.left;
    return { x, y: e.clientY - rect.top, width, height: rect.height, frame: view.current.start + ((x - INSET) / width) * view.current.span, across: (x - INSET) / width };
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

  /** The finger is on `frame`: a section being dragged out, or one of its ends being moved, follows it to the nearest line. */
  const follow = (d: Drag, frame: number) => {
    const near = nearestDrawn(frame);
    if (!near) return;
    const { maxBeats: limit, selection: now } = latest.current;
    if (d.kind === "select") {
      const end = limitEnd(d.anchor, near.line, limit);
      if (end === d.anchor) return latest.current.onSelect(null);
      latest.current.onSelect({ first: Math.min(d.anchor, end), last: Math.max(d.anchor, end) });
    } else if (d.kind === "handle" && now) {
      // An end moves, the other stays; it cannot cross it or pull the section past the longest.
      const line = d.which === "start" ? Math.min(Math.max(near.line, d.anchor - limit), d.anchor - 1) : Math.max(Math.min(near.line, d.anchor + limit), d.anchor + 1);
      latest.current.onSelect(d.which === "start" ? { first: line, last: d.anchor } : { first: d.anchor, last: line });
    }
  };

  const edgeRun = (d: Drag) => {
    const step = (now: number) => {
      if (drag.current !== d) return;
      const rect = canvas.current!.getBoundingClientRect();
      const dt = Math.min(0.05, (now - d.last) / 1000);
      d.last = now;
      let speed = 0;
      if (d.x < EDGE_PX) speed = -(1 - Math.max(0, d.x) / EDGE_PX);
      else if (d.x > rect.width - EDGE_PX) speed = 1 - Math.max(0, rect.width - d.x) / EDGE_PX;
      if (speed !== 0 && d.moved) {
        const { start, span } = view.current;
        view.current = { start: clamp(start + speed * (span / EDGE_SECONDS) * dt, span), span };
        follow(d, view.current.start + ((d.x - INSET) / (rect.width - 2 * INSET)) * view.current.span);
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
    const g = geometry(e);
    const { mode: m, selection: picked, grid: gr } = latest.current;
    const d: Drag = { id: e.pointerId, kind: "pan", startX: e.clientX, startY: e.clientY, moved: false, pivot: g.frame, anchor: 0, which: "start", x: g.x, raf: 0, last: performance.now() };
    if (m === "select") {
      const { start, span } = view.current;
      const px = (frame: number) => INSET + ((frame - start) / span) * g.width;
      // An end of the section being picked, if the finger is down in the strip under the waveform near its tab.
      if (picked && g.y >= g.height - HANDLE_H - 4) {
        const a = Math.abs(px(lineFrame(gr, picked.first)) - g.x);
        const b = Math.abs(px(lineFrame(gr, picked.last)) - g.x);
        if (Math.min(a, b) <= HANDLE_W / 2 + 6) {
          d.kind = "handle";
          d.which = a <= b ? "start" : "end";
          d.anchor = d.which === "start" ? picked.last : picked.first;
          d.moved = true; // an end follows the finger from the first touch: there is no tap to tell it from
        }
      }
      if (d.kind === "pan") {
        d.kind = "select";
        d.anchor = nearestDrawn(g.frame)?.line ?? 0;
      }
    }
    drag.current = d;
    if (d.kind !== "pan") edgeRun(d);
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
    if (d.kind !== "pan") {
      follow(d, g.frame);
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
    draw();
    if (cancelled) return;
    if (d.kind === "handle") return latest.current.onHandleRelease(d.which);
    if (d.moved) return;
    // A tap. Twice in a row on the section being picked puts it in the list; otherwise it picks the line it landed near.
    const g = geometry(e);
    const { selection: picked, grid: gr } = latest.current;
    const now = performance.now();
    const inside = picked && g.frame >= lineFrame(gr, picked.first) && g.frame <= lineFrame(gr, picked.last);
    if (inside && now - lastTap.current.time <= DOUBLE_TAP_MS && Math.abs(g.x - lastTap.current.x) <= DOUBLE_TAP_PX) {
      lastTap.current = { time: 0, x: 0 };
      return latest.current.onDoubleTap();
    }
    lastTap.current = { time: now, x: g.x };
    const near = nearestDrawn(g.frame);
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
