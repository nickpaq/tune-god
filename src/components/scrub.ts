import { useRef } from "react";
import type { PointerEvent } from "react";

/** The speed a scrub has slowed to by the bottom of the screen (a tenth of full speed). */
export const SLOWEST_SCRUB = 0.1;
/** The room below the start of a scrub that the slowing is spread over, at least, so a scrub begun near the bottom still slows smoothly. */
const MIN_ROOM_PX = 60;

/**
 * Knobs and number fields are scrubbed from left to right: only the sideways travel changes the value. How fast it changes depends on how far down the
 * screen the finger is: full speed level with (or above) where it went down, then smoothly slower (a smoothstep, no steps) to a tenth of that speed at
 * the bottom of the screen.
 */
export function scrubSpeed(startY: number, y: number, screenHeight = window.innerHeight): number {
  const room = Math.max(MIN_ROOM_PX, screenHeight - startY);
  const t = Math.min(1, Math.max(0, (y - startY) / room));
  return 1 - (1 - SLOWEST_SCRUB) * t * t * (3 - 2 * t);
}

/**
 * Pointer handlers for a knob or number field: dragging right raises `value` by `perPx` per pixel (left lowers it), slowed by `scrubSpeed`. The value is
 * kept unrounded while the finger is down so slow drags still add up; `onChange` gets it clamped to min..max.
 */
export function useScrub({ value, perPx, min, max, onChange, onStart, onEnd }: { value: number; perPx: number; min: number; max: number; onChange: (value: number) => void; onStart?: () => void; onEnd?: () => void }) {
  const drag = useRef<{ id: number; x: number; y0: number; raw: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent<Element>) => {
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the move and up events still reach the element */
      }
      drag.current = { id: e.pointerId, x: e.clientX, y0: e.clientY, raw: value };
      onStart?.();
    },
    onPointerMove: (e: PointerEvent<Element>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      d.raw = Math.min(max, Math.max(min, d.raw + (e.clientX - d.x) * perPx * scrubSpeed(d.y0, e.clientY)));
      d.x = e.clientX;
      onChange(d.raw);
    },
    onPointerUp: () => {
      if (drag.current) onEnd?.();
      drag.current = null;
    },
    onPointerCancel: () => {
      if (drag.current) onEnd?.();
      drag.current = null;
    },
  };
}
