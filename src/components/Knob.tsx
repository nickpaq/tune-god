import { useScrub } from "./scrub";

/** The sweep of the dial: from 7 o'clock to 5 o'clock, in degrees from straight up. */
const MIN_DEG = -135;
const MAX_DEG = 135;
/** Pixels of sideways dragging that cover the whole range (at full speed). */
const TRAVEL_PX = 140;

/**
 * A rotary knob in the screen's colours for a value from 0 to 1: drag right to turn it up and left to turn it down (the whole range takes
 * about 140 px of travel, slowing to a tenth by the bottom of the screen: `scrub.ts`), or use the arrow keys. It is a slider as far as assistive tech is concerned.
 */
export function Knob({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const scrub = useScrub({ value, perPx: 1 / TRAVEL_PX, min: 0, max: 1, onChange });
  const angle = MIN_DEG + (MAX_DEG - MIN_DEG) * value;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const point = (deg: number, r: number) => [20 + r * Math.sin((deg * Math.PI) / 180), 20 - r * Math.cos((deg * Math.PI) / 180)];
  const [x1, y1] = point(angle, 5);
  const [x2, y2] = point(angle, 15);
  const [sx, sy] = point(MIN_DEG, 17);
  const [ex, ey] = point(angle, 17);
  return (
    <div className="knob">
      <svg
        className="knob__dial"
        viewBox="0 0 40 40"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        {...scrub}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(clamp(value + 0.05));
          else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(clamp(value - 0.05));
        }}
      >
        <circle cx="20" cy="20" r="17" className="knob__ring" />
        {value > 0 ? <path d={`M ${sx} ${sy} A 17 17 0 ${angle - MIN_DEG > 180 ? 1 : 0} 1 ${ex} ${ey}`} className="knob__arc" /> : null}
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="knob__tick" />
      </svg>
      <span className="knob__label">{label}</span>
    </div>
  );
}
