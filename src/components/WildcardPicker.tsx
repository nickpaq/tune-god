import { useEffect, useRef, useState } from "react";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { type TapGrid } from "../audio/song/tapGrid";
import {
  positionText,
  stepsPerBar,
  type MakerChop,
} from "../audio/song/patternMaker";
import { clamp, mod, sourceCandidates } from "../audio/song/sectionWorkspace";
import { quantizeNote } from "../audio/song/noteLengths";

interface Props {
  section: MakerChop;
  bars: number;
  interval: number;
  offset: number;
  grid: TapGrid;
  pyramid: PeakPyramid;
  colors: readonly string[];
  onInsert: (chop: MakerChop) => void;
  onCancel: () => void;
  onPreview: (chop: MakerChop) => void;
}
export function WildcardPicker({
  section,
  bars,
  interval,
  offset,
  grid,
  pyramid,
  colors,
  onInsert,
  onCancel,
  onPreview,
}: Props) {
  const max = Math.max(
    0,
    Math.floor((section.steps - interval + 1e-8) / interval) * interval,
  );
  const snap = (point: number) =>
    quantizeNote(clamp(Math.round(point / interval) * interval, 0, max));
  const [point, setPoint] = useState(() => snap(offset));
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const candidate = sourceCandidates(
    grid,
    pyramid.totalFrames,
    bars,
    point,
    interval,
    colors,
  ).find(
    (c) =>
      Math.floor(c.barIndex / bars) === Math.floor(section.barIndex / bars),
  );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const draw = () => {
      const el = canvas.current,
        ctx = el?.getContext("2d");
      if (!el || !ctx) return;
      const w = el.clientWidth,
        h = el.clientHeight,
        ratio = window.devicePixelRatio || 1;
      el.width = w * ratio;
      el.height = h * ratio;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, w, h);
      const columns = Math.ceil(w / 2),
        lo = new Float32Array(columns),
        hi = new Float32Array(columns);
      columnPeaks(pyramid, section.start, section.length, columns, lo, hi);
      const barSteps = stepsPerBar(grid.beatsPerBar);
      for (let i = 0; i < columns; i++) {
        ctx.fillStyle =
          colors[
            mod(
              section.barIndex +
                Math.floor(((i / columns) * section.steps) / barSteps),
              4,
            )
          ];
        const peak = Math.max(-lo[i], hi[i]) / Math.max(0.001, pyramid.peak);
        ctx.fillRect(
          (i / columns) * w,
          h / 2 - peak * h * 0.32,
          1.5,
          Math.max(1, peak * h * 0.64),
        );
      }
      const origin = section.barIndex * barSteps;
      for (let step = 0; step <= section.steps; step += barSteps) {
        ctx.fillStyle =
          colors[mod(section.barIndex + Math.floor(step / barSteps), 4)];
        ctx.globalAlpha = 0.65;
        ctx.fillRect((step / section.steps) * w, 0, 1, h);
        ctx.font = "12px Barlow Semi Condensed, sans-serif";
        ctx.fillText(
          `BAR ${Math.floor((origin + step) / barSteps) + 1}`,
          (step / section.steps) * w + 3,
          16,
        );
      }
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        (point / section.steps) * w,
        0,
        (interval / section.steps) * w,
        h,
      );
      ctx.globalAlpha = 1;
      ctx.fillRect((point / section.steps) * w, 0, 2, h);
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [point, section, interval, grid, pyramid, colors]);
  const select = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    setPoint(snap(((e.clientX - bounds.left) / bounds.width) * section.steps));
  };
  return (
    <div className="section-wildcard-backdrop" onClick={onCancel}>
      <div
        className="section-wildcard"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Wildcard source selection"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
          if (e.key === "Tab") {
            const nodes = [
              ...(dialog.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input",
              ) ?? []),
            ];
            if (e.shiftKey && document.activeElement === nodes[0]) {
              e.preventDefault();
              nodes.at(-1)?.focus();
            } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
              e.preventDefault();
              nodes[0]?.focus();
            }
          }
        }}
      >
        <div className="chop__head">
          <span>Wildcard · {bars} bars</span>
          <button aria-label="Cancel wildcard" onClick={onCancel}>
            ×
          </button>
        </div>
        <p>
          Choose a different source position for one chop. Snaps to the selected
          note length.
        </p>
        <canvas
          ref={canvas}
          aria-label="Multicolor wildcard source waveform"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            select(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) select(e);
          }}
        />
        <input
          aria-label="Wildcard source position"
          type="range"
          min={0}
          max={max}
          step={interval}
          value={point}
          onChange={(e) => setPoint(snap(Number(e.target.value)))}
        />
        <div role="status">
          Source{" "}
          {positionText(
            section.barIndex * stepsPerBar(grid.beatsPerBar) + point,
            grid.beatsPerBar,
          )}{" "}
          · {interval / 4} beat
        </div>
        <div className="section-actions">
          <button
            className="chop__btn"
            disabled={!candidate}
            onClick={() => candidate && onPreview(candidate)}
          >
            Preview wildcard
          </button>
          <button className="chop__btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <button
          className="chop__go"
          disabled={!candidate}
          onClick={() => candidate && onInsert(candidate)}
        >
          Insert wildcard chop
        </button>
      </div>
    </div>
  );
}
