import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import { scrubSpeed } from "./scrub";

/** The slider's range: 12 semitones either way. */
const RANGE = 1200;
/** In cents mode the slider covers this many cents either side of the semitone it was set on: just past the halfway point (50), where the pitch snaps to the next semitone and the dial centres on it. */
const CENTS_RANGE = 55;
/** A press that moves less than this (px) and ends within TAP_MS is a tap. */
const TAP_PX = 6;
const TAP_MS = 350;
/** A second tap this soon after the first is a double tap. */
const DOUBLE_MS = 300;
/** How long the line takes to bend between the straight slider and the tuner dial. */
const BEND_MS = 240;

/** The drawing: 400 x 40 units, stretched to the slider's box. The line lies along y 32; bent, its middle rises SAG units and the hand swings from a pivot far below. */
const W = 400;
const H = 40;
const X0 = 10;
const X1 = 390;
const BASE_Y = 32;
const SAG = 24;
const HAND = 17;
/** Half the angle the hand sweeps either side of centre, in radians (the dial's arc is that of a circle through the line's ends and its raised middle). */
const radius = ((X1 - X0) / 2) ** 2 / (2 * SAG) + SAG / 2;
const HALF_ANGLE = Math.asin((X1 - X0) / 2 / radius);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wholeSemitone = (cents: number) => Math.round(cents / 100) * 100;

/** A point on the line for u in -1..1 (left end to right end) with the line bent by `k` (0 straight, 1 the dial's arc), and the angle of its tangent. */
function onLine(u: number, k: number) {
  const half = (X1 - X0) / 2;
  return { x: (X0 + X1) / 2 + u * half, y: BASE_Y - SAG * k * (1 - u * u), tilt: Math.atan((2 * SAG * k * u) / half) };
}

/**
 * The Tune screen's pitch slider (the pad's trim, in cents, +-12 semitones). Drag left or right to scrub: the speed slows smoothly to a tenth toward the
 * bottom of the screen (`scrubSpeed`), but in semitone mode the value always lands on whole semitones (with any cents offset the pad already has kept).
 * A tap swaps between semitone mode and cents mode; a double tap puts the pitch back to the middle. In cents mode the line bends into a tuner dial
 * with a hand, and the slider covers 55 cents either side of the semitone it was on (past that it snaps to the next semitone). Dragged up, the value stays put and `onAbove` reports the finger.
 */
export function PitchSlider({
  value,
  cents,
  onCents,
  onChange,
  onReset,
  onDragStart,
  onDragEnd,
  onAbove,
  disabled,
  title,
  valueLabel,
}: {
  value: number;
  cents: boolean;
  onCents: (cents: boolean) => void;
  onChange: (value: number) => void;
  onReset: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onAbove?: (point: { x: number; y: number } | null) => void;
  disabled?: boolean;
  title?: string;
  valueLabel?: (value: number) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; x: number; t0: number; raw: number; offset: number; anchor: number; moved: boolean } | null>(null);
  const tap = useRef<{ at: number; was: boolean }>({ at: 0, was: cents });
  const [dragging, setDragging] = useState(false);

  // The bend follows the mode smoothly.
  const [bend, setBend] = useState(cents ? 1 : 0);
  const bendRef = useRef(bend);
  useEffect(() => {
    const from = bendRef.current;
    const to = cents ? 1 : 0;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / BEND_MS);
      const eased = t * t * (3 - 2 * t);
      bendRef.current = from + (to - from) * eased;
      setBend(bendRef.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents]);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const anchor = wholeSemitone(value);
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t0: performance.now(), raw: value, offset: value - anchor, anchor, moved: false };
    setDragging(true);
    onDragStart?.();
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const rect = box.current?.getBoundingClientRect();
    if (!d || !rect || d.id !== e.pointerId) return;
    e.preventDefault();
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > TAP_PX) d.moved = true;
    const dx = e.clientX - d.x;
    d.x = e.clientX;
    const above = e.clientY < rect.top - 12;
    onAbove?.(above ? { x: e.clientX, y: e.clientY } : null);
    // Dragged up the value stays where it was: the finger is free to go sideways (to the chord squares) without pitching anything.
    if (above) return;
    const span = cents ? CENTS_RANGE * 2 : RANGE * 2;
    d.raw += (dx / rect.width) * span * scrubSpeed(d.y0, e.clientY);
    if (cents) {
      d.raw = clamp(d.raw, -RANGE, RANGE);
      // Past the edge of the dial the pitch snaps to the next semitone and the dial centres on it.
      if (Math.abs(d.raw - d.anchor) > CENTS_RANGE) {
        d.anchor = wholeSemitone(d.raw);
        d.raw = d.anchor;
      }
      onChange(Math.round(d.raw * 10) / 10);
    } else {
      d.raw = clamp(d.raw, -RANGE, RANGE);
      // Whole semitones from where the drag began: a cents offset the pitch already had stays until a double tap resets it.
      onChange(clamp(wholeSemitone(d.raw - d.offset) + d.offset, -RANGE, RANGE));
    }
  };

  const end = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    onAbove?.(null);
    if (!cancelled && !d.moved && performance.now() - d.t0 < TAP_MS) {
      const now = performance.now();
      if (now - tap.current.at < DOUBLE_MS) {
        // Second tap: undo the first tap's mode swap and go back to the middle.
        tap.current.at = 0;
        onCents(tap.current.was);
        onReset();
      } else {
        tap.current = { at: now, was: cents };
        onCents(!cents);
      }
    }
    onDragEnd?.();
  };

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = cents ? 10 : 100;
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onChange(clamp(value + dir * step, -RANGE, RANGE));
  };

  // The marks: a semitone mark for each of the 25 whole semitones (the detents), ten-cent marks for the dial; one set fades into the other as the line bends.
  const semiMarks = Array.from({ length: 25 }, (_, i) => ({ u: (i - 12) / 12, long: i === 12 || i % 12 === 0, mid: i % 6 === 0 }));
  const centMarks = Array.from({ length: 11 }, (_, j) => ({ u: ((j - 5) * 10) / CENTS_RANGE, long: j === 5 || j === 0 || j === 10, mid: false }));
  const mark = (m: { u: number; long: boolean; mid: boolean }, key: string, opacity: number) => {
    if (opacity <= 0.01) return null;
    const p = onLine(m.u, bend);
    const len = m.long ? 14 : m.mid ? 10 : 6;
    // The mark crosses the line at right angles.
    const dx = -Math.sin(p.tilt) * (len / 2);
    const dy = Math.cos(p.tilt) * (len / 2);
    return <line key={key} x1={p.x + dx} y1={p.y + dy} x2={p.x - dx} y2={p.y - dy} className="pitch-slider__mark" style={{ opacity }} />;
  };
  const linePoints = Array.from({ length: 41 }, (_, i) => {
    const p = onLine((i - 20) / 20, bend);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" ");

  // Where the thumb (semitone mode) and the hand (cents mode) are.
  const anchor = wholeSemitone(value);
  const thumbU = value / RANGE;
  const handU = clamp((value - (dragging && drag.current ? drag.current.anchor : anchor)) / CENTS_RANGE, -1, 1);
  const thumb = onLine(thumbU, bend);
  const tip = onLine(handU, bend);
  const handAngle = handU * HALF_ANGLE;
  const labelU = bend > 0.5 ? handU : thumbU;
  const pct = ((labelU + 1) / 2) * 100;

  return (
    <div
      ref={box}
      className="pitch-slider"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-valuemin={-RANGE}
      aria-valuemax={RANGE}
      aria-valuenow={value}
      aria-label={title}
      title={title}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={(e) => end(e, true)}
      onKeyDown={keys}
    >
      <svg className="pitch-slider__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline points={linePoints} className="pitch-slider__line" />
        {semiMarks.map((m, i) => mark(m, `s${i}`, 1 - bend))}
        {centMarks.map((m, i) => mark(m, `c${i}`, bend))}
        {bend < 1 && <rect x={thumb.x - 6} y={thumb.y - 12} width="12" height="24" className="pitch-slider__thumb" style={{ opacity: 1 - bend }} />}
        {bend > 0 && (
          <line
            className="pitch-slider__hand"
            style={{ opacity: bend }}
            x1={tip.x - Math.sin(handAngle) * HAND}
            y1={tip.y + Math.cos(handAngle) * HAND}
            x2={tip.x + Math.sin(handAngle) * 4}
            y2={tip.y - Math.cos(handAngle) * 4}
          />
        )}
      </svg>
      {dragging && valueLabel && (
        <div className="precision-slider__bubble" style={{ left: `${pct}%`, transform: `translateX(-${pct}%)` }}>
          {valueLabel(value)}
        </div>
      )}
    </div>
  );
}
