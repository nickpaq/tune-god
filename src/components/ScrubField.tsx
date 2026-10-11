import { useRef } from "react";
import type { PointerEvent } from "react";
import { scrubSpeed, useScrub } from "./scrub";

/** A press that moves less than this (px) and ends within TAP_MS is a tap; a second tap within DOUBLE_MS of the first is a double tap. */
const TAP_PX = 6;
const TAP_MS = 350;
const DOUBLE_MS = 300;
/** A vertical-whole-number field decides sideways or vertical once the finger has moved this far (px), and keeps to that axis for the rest of the press. */
const AXIS_PX = 8;

export function ScrubField({ value, text, min, max, perPx, onChange, onDoubleTap, label, wholePerPx }: { value: number; text: string; min: number; max: number; perPx: number; onChange: (value: number) => void; /** Two quick taps (no dragging), e.g. to reset the value. */ onDoubleTap?: () => void; label: string; /** Dragging up or down steps the value by whole numbers, this many per pixel (up raises); dragging sideways still scrubs by `perPx`. */ wholePerPx?: number }) {
  const scrub = useScrub({ value, perPx, min, max, onChange });
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef(0);
  // Whole-number mode: one axis per press, picked from the first movement.
  const axis = useRef<{ id: number; x: number; y: number; x0: number; y0: number; raw: number; kind: "x" | "y" | null } | null>(null);
  const vertical =
    wholePerPx === undefined
      ? {}
      : {
          onPointerDown: (e: PointerEvent<Element>) => {
            axis.current = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, raw: value, kind: null };
          },
          onPointerMove: (e: PointerEvent<Element>) => {
            const a = axis.current;
            if (!a || a.id !== e.pointerId) return;
            if (!a.kind) {
              const dx = Math.abs(e.clientX - a.x0);
              const dy = Math.abs(e.clientY - a.y0);
              if (Math.max(dx, dy) < AXIS_PX) return;
              a.kind = dy > dx ? "y" : "x";
              if (a.kind === "y") a.raw = Math.round(a.raw);
              a.x = e.clientX;
              a.y = e.clientY;
              return;
            }
            if (a.kind === "x") {
              a.raw = Math.min(max, Math.max(min, a.raw + (e.clientX - a.x) * perPx * scrubSpeed(a.y0, e.clientY)));
              a.x = e.clientX;
              onChange(a.raw);
            } else {
              a.raw = Math.min(max, Math.max(min, a.raw + (a.y - e.clientY) * wholePerPx));
              a.y = e.clientY;
              onChange(Math.round(a.raw));
            }
          },
        };
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
        if (wholePerPx === undefined) scrub.onPointerDown(e);
        else {
          e.stopPropagation();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* the move and up events still reach the element */
          }
          vertical.onPointerDown?.(e);
        }
      }}
      onPointerMove={wholePerPx === undefined ? scrub.onPointerMove : vertical.onPointerMove}
      onPointerUp={(e: PointerEvent<Element>) => {
        const p = press.current;
        press.current = null;
        axis.current = null;
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
