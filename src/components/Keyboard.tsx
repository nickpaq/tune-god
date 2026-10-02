import { useRef } from "react";
import { NOTE_NAMES } from "../audio/theory";
import { startSine } from "../audio/player";

const SHARP = new Set([1, 3, 6, 8, 10]);

/**
 * The twelve notes in a row, for choosing the key to tune to (not for playing). Holding a note sounds a sine tone;
 * the selected note is marked, and tapping it again deselects it.
 */
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

  return (
    <div className="keyboard" role="group" aria-label="Key">
      {NOTE_NAMES.map((name, pc) => (
        <button
          key={name}
          className={`key ${SHARP.has(pc) ? "key--sharp" : "key--natural"}${selected === pc ? " key--selected" : ""}`}
          aria-pressed={selected === pc}
          onPointerDown={(e) => press(e, pc)}
          onPointerUp={release}
          onPointerCancel={release}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
