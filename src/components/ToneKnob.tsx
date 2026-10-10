import { useScrub } from "./scrub";
import { knobRows, SIZE } from "./toneKnobRows";

/** Dragging this many pixels to the right turns the knob from its lowest to its highest. */
const DRAG_PX = 120;

/**
 * The reference tone's volume, a pixel knob on the OLED. Drag left or right to turn it (slower toward the bottom of the screen); a double tap puts it back in the middle (the level the tone
 * had before there was a knob). It is dimmed while the tone is off, but can still be turned.
 */
export function ToneKnob({ value, onChange, dim }: { value: number; onChange: (value: number) => void; dim: boolean }) {
  const scrub = useScrub({ value, perPx: 1 / DRAG_PX, min: 0, max: 1, onChange });
  const rows = knobRows(value);
  return (
    <div
      className={`tone-knob${dim ? " tone-knob--dim" : ""}`}
      role="slider"
      aria-label="Tone volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      {...scrub}
      onDoubleClick={() => onChange(0.5)}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} shapeRendering="crispEdges" aria-hidden="true">
        {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
      </svg>
    </div>
  );
}
