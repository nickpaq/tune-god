import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { isDrag, viewUnderFinger } from "../audio/song/zoom";
import { isBarLine, lineFrame, linesBetween, type TapGrid } from "../audio/song/tapGrid";

/** Lines closer together than this (CSS pixels) are not drawn (beats first, then bars). */
const MIN_LINE_PX = 7;
/** Height (CSS pixels) of the strip along the top that carries the chop flags, and of the one along the bottom that carries the downbeat flags. */
const FLAG_H = 14;
/** The closest view, in seconds across. */
const MIN_SPAN_SECONDS = 0.25;
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
 * the song plays from. Dragging scrubs (the waveform follows the finger), the buttons zoom. Over it: a line for every beat (the first beat of each bar
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
    /** A finger started scrubbing. */
    onScrub: () => void;
  }
>(function ChopTimeline({ pyramid, sampleRate, grid, chops, downbeats, oneOne, sections, onScrub }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const total = pyramid.totalFrames;
  const latest = useRef({ grid, chops, downbeats, oneOne, sections, onScrub });
  latest.current = { grid, chops, downbeats, oneOne, sections, onScrub };
  const initialSpan = Math.min(total, START_SECONDS * sampleRate);
  const view = useRef({ cursor: 0, span: initialSpan });
  const drag = useRef<{ id: number; startX: number; startY: number; moved: boolean; pivot: number } | null>(null);
  const buffers = useRef({ lo: new Float32Array(0), hi: new Float32Array(0) });
  const minSpan = Math.min(total, MIN_SPAN_SECONDS * sampleRate);

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
      const beatPx = (g.segments[0].beatFrames * w) / ratio / span;
      const lines = linesBetween(g, Math.max(0, start), Math.min(total, start + span));
      const drawn = beatPx >= MIN_LINE_PX ? lines : beatPx * g.beatsPerBar >= MIN_LINE_PX ? lines.filter((n) => isBarLine(g, n)) : [];
      for (const n of drawn) {
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
    if (drag.current) return;
    const { cursor, span } = view.current;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, pivot: cursor - span / 2 + across(e.clientX) * span };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    if (!d.moved) {
      if (!isDrag(e.clientX - d.startX, e.clientY - d.startY)) return;
      d.moved = true;
      // Pin what is under the finger now, so the waveform does not jump by the distance the tap threshold swallowed.
      d.pivot = view.current.cursor - view.current.span / 2 + across(e.clientX) * view.current.span;
      latest.current.onScrub();
    }
    // The point of the waveform that was under the finger stays under it: the cursor ends up wherever that puts the middle of the view.
    const { span } = view.current;
    const start = viewUnderFinger(d.pivot, across(e.clientX), span);
    setCursor(start + span / 2);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const zoom = (factor: number) => {
    const span = Math.min(total, Math.max(minSpan, view.current.span * factor));
    view.current = { cursor: view.current.cursor, span };
    draw();
  };

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
        <button className="chop__btn" onClick={() => zoom(2)} aria-label="Zoom out">
          −
        </button>
        <span ref={time} className="chop-timeline__range" />
        <button className="chop__btn" onClick={() => zoom(0.5)} aria-label="Zoom in">
          +
        </button>
      </div>
    </div>
  );
});
