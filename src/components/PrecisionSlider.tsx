import { useRef } from "react";

/**
 * How much a slider's horizontal drag is slowed per pixel of vertical travel
 * away from the initial touch/click point — dragging straight down lets you
 * fine-tune the value instead of jumping across the full range in a few
 * millimeters. Continuous rather than a stepped zone, so there's no jarring
 * snap as the finger crosses a threshold; speed only ever asymptotically
 * approaches (never hits) zero, so extreme drags still nudge the value.
 */
const VERTICAL_SLOWDOWN_SOFTNESS = 60;

interface DragState {
  pointerId: number;
  lastX: number;
  startY: number;
  value: number;
}

/**
 * A drop-in replacement for `<input type="range">` that overrides pointer
 * dragging with relative-motion physics (so a drag moves the value by how
 * far the pointer travels, not by jumping to its absolute position) and
 * slows that motion the further the pointer strays vertically from where
 * the drag started. Rendered as a real range input — same element, same
 * CSS targeting (`input[type="range"]`), same keyboard behavior (arrow
 * keys still go through the native `onChange`) — only pointer-driven
 * dragging is customized.
 */
export function PrecisionSlider({
  min,
  max,
  step,
  value,
  onChange,
  onDoubleClick,
  title,
  className,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onDoubleClick?: () => void;
  title?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const snapToStep = (v: number) => {
    const stepped = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, stepped));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    e.preventDefault();
    inputRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, startY: e.clientY, value };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
    const drag = dragRef.current;
    const el = inputRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;
    const trackWidth = el.getBoundingClientRect().width || 1;
    const dx = e.clientX - drag.lastX;
    drag.lastX = e.clientX;
    const verticalDistance = Math.abs(e.clientY - drag.startY);
    const speed = 1 / (1 + verticalDistance / VERTICAL_SLOWDOWN_SOFTNESS);
    const deltaValue = (dx / trackWidth) * (max - min) * speed;
    drag.value = Math.min(max, Math.max(min, drag.value + deltaValue));
    onChange(snapToStep(drag.value));
  };

  const endDrag = (e: React.PointerEvent<HTMLInputElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  return (
    <input
      ref={inputRef}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      title={title}
      className={className}
      style={{ touchAction: "none" }}
    />
  );
}
