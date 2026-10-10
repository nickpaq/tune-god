import { useScrub } from "./scrub";

/** A number shown in a box that is edited by touching it and dragging left or right (no keyboard). `perPx` is the change per pixel at full speed. */
export function ScrubField({ value, text, min, max, perPx, onChange, label }: { value: number; text: string; min: number; max: number; perPx: number; onChange: (value: number) => void; label: string }) {
  const scrub = useScrub({ value, perPx, min, max, onChange });
  return (
    <span className="scrub-field" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} {...scrub}>
      {text}
    </span>
  );
}
