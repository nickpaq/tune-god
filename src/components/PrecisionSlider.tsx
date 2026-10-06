import { useState, useRef } from "react";

/** Below this much room between the touch and the bottom of the screen, the full fine-tune is reached in this many pixels. */
const MIN_DRAG_ROOM_PX = 60;

/** Where the finger is relative to the track while dragging: above it (dragged up), over it, or below it (dragged down, where the control gets finer). */
export type SliderZone = "up" | "track" | "down";

/** Everything a guide needs to draw how the drag works, in client pixels. */
export interface SliderGuide {
  zone: SliderZone;
  /** The finger. */
  y: number;
  /** Where the drag started and how far below that the control is at its finest. */
  startY: number;
  room: number;
  /** The track's box. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The whole range and the finest span (the same units as the value), and what a sweep across the whole track changes the value by at the finger's height. */
  range: number;
  fineSpan: number;
  sweep: number;
}

interface DragState {
  pointerId: number;
  lastX: number;
  startY: number;
  value: number;
  /** Pixels from where the drag started to the bottom of the screen, the distance over which the slider gets finer. */
  room: number;
  /** The cents left over when the drag began (the value minus its nearest whole coarse step), kept while snapping. */
  offset: number;
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
 * than jumping to its absolute position. Level with (or above) where the drag
 * started the thumb follows the finger one to one; the lower the finger goes
 * toward the bottom of the screen, the finer the control gets, smoothly, until
 * at the very bottom a sweep across the whole track changes the value by only
 * `fineSpan`. Keyboard
 * (arrow/Home/End/Page keys) and double-click-to-reset are reimplemented
 * manually since there's no native input backing them anymore.
 */
export function PrecisionSlider({
  min,
  max,
  step,
  keyStep = step,
  fineSpan,
  coarseStep,
  coarseStops,
  value,
  onChange,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onZoneChange,
  onGuide,
  disabled,
  title,
  className,
  valueLabel,
  bipolar,
}: {
  min: number;
  max: number;
  step: number;
  /** How far an arrow key moves the value (Page keys move ten times this). Defaults to `step`. */
  keyStep?: number;
  /** How much the value changes across the whole track when the finger is at the bottom of the screen: the finest setting. */
  fineSpan: number;
  /** While the finger is directly over the track, the value snaps to multiples of this (e.g. whole semitones). */
  coarseStep?: number;
  /** While the finger is above the track (dragged up), the only values the thumb stops on (e.g. the offsets a pitch detector gets wrong by). */
  coarseStops?: number[];
  value: number;
  onChange: (value: number) => void;
  onDoubleClick?: () => void;
  /** A drag (or a held arrow key) began. */
  onDragStart?: () => void;
  /** The drag (or the held key) ended; the value is whatever the last onChange reported. */
  onDragEnd?: () => void;
  /** The finger crossed into another zone (reported at the start of a drag too, as "track"). */
  onZoneChange?: (zone: SliderZone) => void;
  /** Where the finger is and how the drag is scaled, for a guide drawn over the screen; null when the drag ends. */
  onGuide?: (guide: SliderGuide | null) => void;
  /** Ignores the pointer and the keyboard. */
  disabled?: boolean;
  title?: string;
  className?: string;
  /** When set, shows a floating bubble above the thumb with this text while the slider is being dragged. */
  valueLabel?: (value: number) => string;
  /** Fills from the middle of the track outward instead of from the left edge (for ± trim sliders). */
  bipolar?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const keyHeld = useRef(false);
  const zoneRef = useRef<SliderZone>("track");

  /** The multiple of `coarseStep` nearest to `v`. */
  const snapWhole = (v: number) => (coarseStep ? Math.round(v / coarseStep) * coarseStep : v);
  /** The stop in `coarseStops` nearest to `v`. */
  const snapStop = (v: number) => (coarseStops?.length ? coarseStops.reduce((best, stop) => (Math.abs(stop - v) < Math.abs(best - v) ? stop : best), coarseStops[0]) : v);

  const snapToStep = (v: number) => {
    const stepped = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, stepped));
  };

  const drag0 = () => dragRef.current;

  /** Tells the guide where the finger is: its zone, and how much a sweep across the track changes the value at that height. */
  const reportGuide = (y: number, drag: DragState | null) => {
    const track = trackRef.current;
    if (!onGuide || !drag || !track) return;
    const r = track.getBoundingClientRect();
    const down = Math.min(1, Math.max(0, (y - drag.startY) / drag.room));
    const zone: SliderZone = y < r.top - 12 ? "up" : y > r.bottom + 12 ? "down" : "track";
    onGuide({ zone, y, startY: drag.startY, room: drag.room, left: r.left, right: r.right, top: r.top, bottom: r.bottom, range: max - min, fineSpan, sweep: (max - min) * Math.pow(fineSpan / (max - min), down) });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      startY: e.clientY,
      value,
      offset: coarseStep ? value - snapWhole(value) : 0,
      room: Math.max(MIN_DRAG_ROOM_PX, (window.innerHeight - e.clientY) / 2),
    };
    setDragging(true);
    zoneRef.current = "track";
    onZoneChange?.("track");
    reportGuide(e.clientY, drag0());
    onDragStart?.();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const trackWidth = track.getBoundingClientRect().width || 1;
    const dx = e.clientX - drag.lastX;
    drag.lastX = e.clientX;
    // 0 level with the touch (or above it), 1 at the bottom of the screen. The sweep per track width goes from the
    // whole range down to fineSpan along a geometric curve, so every bit of extra downward travel feels the same.
    const down = Math.min(1, Math.max(0, (e.clientY - drag.startY) / drag.room));
    const sweep = (max - min) * Math.pow(fineSpan / (max - min), down);
    const deltaValue = (dx / trackWidth) * sweep;
    drag.value = Math.min(max, Math.max(min, drag.value + deltaValue));
    const rect = track.getBoundingClientRect();
    const overTrack = e.clientY >= rect.top - 12 && e.clientY <= rect.bottom + 12;
    const above = e.clientY < rect.top - 12;
    const zone: SliderZone = above ? "up" : e.clientY > rect.bottom + 12 ? "down" : "track";
    if (zone !== zoneRef.current) {
      zoneRef.current = zone;
      onZoneChange?.(zone);
    }
    reportGuide(e.clientY, drag);
    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    // Whole steps (or stops) from where the drag began, so any cents offset the value already had stays until a double-tap resets it.
    if (coarseStops?.length && above) onChange(clamp(snapStop(drag.value - drag.offset) + drag.offset));
    else if (coarseStep && (overTrack || above)) onChange(clamp(snapWhole(drag.value - drag.offset) + drag.offset));
    else onChange(snapToStep(drag.value));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
      onGuide?.(null);
      onDragEnd?.();
    }
  };

  const onKeyUp = () => {
    if (!keyHeld.current) return;
    keyHeld.current = false;
    onDragEnd?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const bigStep = keyStep * 10;
    const moves = ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key);
    if (moves && !keyHeld.current && !dragRef.current) {
      keyHeld.current = true;
      onDragStart?.();
    }
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        onChange(snapToStep(value + keyStep));
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        onChange(snapToStep(value - keyStep));
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
  const fillStyle = bipolar
    ? { left: `${Math.min(pct, 50)}%`, width: `${Math.abs(pct - 50)}%` }
    : { width: `${pct}%` };

  return (
    <div
      className={["precision-slider", className].filter(Boolean).join(" ")}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
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
      onKeyUp={onKeyUp}
      onBlur={onKeyUp}
    >
      <div className="precision-slider__track" ref={trackRef}>
        <div className="precision-slider__fill" style={fillStyle} />
        <div className="precision-slider__thumb" style={{ left: `${pct}%` }} />
        {dragging && valueLabel && (
          <div className="precision-slider__bubble" style={{ left: `${pct}%`, transform: `translateX(-${pct}%)` }}>
            {valueLabel(value)}
          </div>
        )}
      </div>
    </div>
  );
}
