import { useRef } from "react";
import { NOTE_NAMES } from "../audio/theory";
import { startSine } from "../audio/player";

/** The seven naturals left to right, then each sharp with the natural it sits just after. */
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const SHARPS: { pc: number; after: number }[] = [
  { pc: 1, after: 0 },
  { pc: 3, after: 1 },
  { pc: 6, after: 3 },
  { pc: 8, after: 4 },
  { pc: 10, after: 5 },
];

/**
 * The twelve notes as a piano octave (seven naturals, five sharps standing over them), for choosing the key to tune to
 * (not for playing). Holding a note sounds a sine tone; the selected note is marked, and tapping it again deselects it.
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

  const handlers = (pc: number) => ({
    "aria-pressed": selected === pc,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => press(e, pc),
    onPointerUp: release,
    onPointerCancel: release,
  });
  const lamp = <span className="key__lamp" />;

  return (
    <div className="keyboard" role="group" aria-label="Key">
      <div className="keyboard__naturals">
        {NATURALS.map((pc) => (
          <button key={pc} className={`key key--natural${selected === pc ? " key--selected" : ""}`} {...handlers(pc)}>
            {lamp}
            <span className="key__name">{NOTE_NAMES[pc]}</span>
          </button>
        ))}
      </div>
      {SHARPS.map(({ pc, after }) => (
        <button
          key={pc}
          className={`key key--sharp${selected === pc ? " key--selected" : ""}`}
          style={{ ["--i" as string]: after }}
          {...handlers(pc)}
        >
          {lamp}
          <span className="key__name">{NOTE_NAMES[pc]}</span>
        </button>
      ))}
    </div>
  );
}
