import { useRef } from "react";
import type { PointerEvent } from "react";
import { useScrub } from "./scrub";

/** A press that moves less than this (px) and ends within TAP_MS is a tap; a second tap within DOUBLE_MS of the first is a double tap. */
const TAP_PX = 6;
const TAP_MS = 350;
const DOUBLE_MS = 300;

export function ScrubField({ value, text, min, max, perPx, onChange, onDoubleTap, label }: { value: number; text: string; min: number; max: number; perPx: number; onChange: (value: number) => void; /** Two quick taps (no dragging), e.g. to reset the value. */ onDoubleTap?: () => void; label: string }) {
  const scrub = useScrub({ value, perPx, min, max, onChange });
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef(0);
  return (
    <span
      className="scrub-field"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      {...scrub}
      onPointerDown={(e: PointerEvent<Element>) => {
        press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
        scrub.onPointerDown(e);
      }}
      onPointerUp={(e: PointerEvent<Element>) => {
        const p = press.current;
        press.current = null;
        scrub.onPointerUp();
        if (!onDoubleTap || !p) return;
        const now = performance.now();
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX || now - p.t > TAP_MS) return void (lastTap.current = 0);
        if (now - lastTap.current < DOUBLE_MS) {
          lastTap.current = 0;
          onDoubleTap();
        } else lastTap.current = now;
      }}
    >
      {text}
    </span>
  );
}
