import { useRef } from "react";

/** The knob is drawn on a grid of this many lit cells each way. */
const SIZE = 17;
/** The pointer sweeps from 135 degrees left of straight up to 135 degrees right of it. */
const SWEEP_DEG = 135;
/** Dragging this many pixels up turns the knob from its lowest to its highest. */
const DRAG_PX = 120;

/** The knob as rows of lit cells: a ring, a centre dot and a pointer line turned to `value` (0 to 1). */
export function knobRows(value: number): string[] {
  const c = (SIZE - 1) / 2;
  const grid = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill("."));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d >= c - 1.1 && d <= c + 0.4) grid[y][x] = "#";
    }
  }
  const angle = ((-SWEEP_DEG + 2 * SWEEP_DEG * Math.min(1, Math.max(0, value))) * Math.PI) / 180;
  for (let r = 0; r <= c - 2; r += 0.25) {
    const x = Math.round(c + Math.sin(angle) * r);
    const y = Math.round(c - Math.cos(angle) * r);
    grid[y][x] = "#";
  }
  return grid.map((row) => row.join(""));
}

/**
 * The reference tone's volume, a pixel knob on the OLED. Drag up or down to turn it; a double tap puts it back in the middle (the level the tone
 * had before there was a knob). It is dimmed while the tone is off, but can still be turned.
 */
export function ToneKnob({ value, onChange, dim }: { value: number; onChange: (value: number) => void; dim: boolean }) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const rows = knobRows(value);
  return (
    <div
      className={`tone-knob${dim ? " tone-knob--dim" : ""}`}
      role="slider"
      aria-label="Tone volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={(e) => {
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* the move and up events still reach the knob */
        }
        drag.current = { y: e.clientY, value };
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(Math.min(1, Math.max(0, drag.current.value + (drag.current.y - e.clientY) / DRAG_PX)));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onChange(0.5)}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} shapeRendering="crispEdges" aria-hidden="true">
        {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
      </svg>
    </div>
  );
}
