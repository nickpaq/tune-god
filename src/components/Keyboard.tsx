import { useRef } from "react";
import { NOTE_NAMES } from "../audio/theory";
import { startSine } from "../audio/player";

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
/** Black keys by pitch class, with how many white keys sit to their left. */
const BLACK_KEYS = [
  { pc: 1, after: 1 },
  { pc: 3, after: 2 },
  { pc: 6, after: 4 },
  { pc: 8, after: 5 },
  { pc: 10, after: 6 },
];

/** One octave. Holding a key sounds a sine tone; the last key pressed stays highlighted as the target key. */
export function Keyboard({ selected, onSelect }: { selected: number | null; onSelect: (pc: number) => void }) {
  const releaseRef = useRef<(() => void) | null>(null);

  const press = (e: React.PointerEvent<HTMLButtonElement>, pc: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    releaseRef.current?.();
    releaseRef.current = startSine(pc);
    onSelect(pc);
  };
  const release = () => {
    releaseRef.current?.();
    releaseRef.current = null;
  };
  const handlers = (pc: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => press(e, pc),
    onPointerUp: release,
    onPointerCancel: release,
  });

  return (
    <div className="keyboard">
      {WHITE_KEYS.map((pc) => (
        <button
          key={pc}
          className={`key key--white${selected === pc ? " key--selected" : ""}`}
          aria-label={NOTE_NAMES[pc]}
          {...handlers(pc)}
        />
      ))}
      {BLACK_KEYS.map(({ pc, after }) => (
        <button
          key={pc}
          className={`key key--black${selected === pc ? " key--selected" : ""}`}
          style={{ left: `${(after / 7) * 100}%` }}
          aria-label={NOTE_NAMES[pc]}
          {...handlers(pc)}
        />
      ))}
    </div>
  );
}
