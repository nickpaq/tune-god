import { useRef } from "react";
import { knobRows, SIZE } from "./toneKnobRows";

/** Dragging this many pixels up turns the knob from its lowest to its highest. */
const DRAG_PX = 120;

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
