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
 * A custom slider — not a native `<input type="range">` — because iOS
 * Safari runs its own built-in touch-drag-to-position handling on real range
 * inputs regardless of `preventDefault()`/`touch-action` on pointer events,
 * which fought with the relative-motion dragging below and made the thumb
 * visibly ping-pong between the two. Rendering our own track/thumb means
 * there's no competing native behavior left to suppress.
 *
 * Pointer dragging moves the value by how far the pointer travels rather
 * than jumping to its absolute position, and slows that motion the further
 * the pointer strays vertically from where the drag started. Keyboard
 * (arrow/Home/End/Page keys) and double-click-to-reset are reimplemented
 * manually since there's no native input backing them anymore.
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
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const snapToStep = (v: number) => {
    const stepped = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, stepped));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, startY: e.clientY, value };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const trackWidth = track.getBoundingClientRect().width || 1;
    const dx = e.clientX - drag.lastX;
    drag.lastX = e.clientX;
    const verticalDistance = Math.abs(e.clientY - drag.startY);
    const speed = 1 / (1 + verticalDistance / VERTICAL_SLOWDOWN_SOFTNESS);
    const deltaValue = (dx / trackWidth) * (max - min) * speed;
    drag.value = Math.min(max, Math.max(min, drag.value + deltaValue));
    onChange(snapToStep(drag.value));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const bigStep = step * 10;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        onChange(snapToStep(value + step));
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        onChange(snapToStep(value - step));
        break;
      case "PageUp":
        e.preventDefault();
        onChange(snapToStep(value + bigStep));
        break;
      case "PageDown":
        e.preventDefault();
        onChange(snapToStep(value - bigStep));
        break;
      case "Home":
        e.preventDefault();
        onChange(min);
        break;
      case "End":
        e.preventDefault();
        onChange(max);
        break;
    }
  };

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      className={["precision-slider", className].filter(Boolean).join(" ")}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={title}
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <div className="precision-slider__track" ref={trackRef}>
        <div className="precision-slider__fill" style={{ width: `${pct}%` }} />
        <div className="precision-slider__thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
