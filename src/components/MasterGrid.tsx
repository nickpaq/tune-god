import { useRef, useState } from "react";
import { scaleGridFrequency, scaleStepsFor, type MasterItem, type TuningMode } from "../state/samplesStore";
import { NOTE_NAMES } from "../audio/theory";
import { playTone, type ToneHandle } from "../audio/playback";

/**
 * Three octave rows, top to bottom, matching Koala's own pad-grid layout —
 * the middle row (brightest shade) sits nearest middle C, top is an octave
 * up, bottom an octave down.
 */
const ROWS: { octaveShift: number; shade: "dark" | "bright" }[] = [
  { octaveShift: 12, shade: "dark" },
  { octaveShift: 0, shade: "bright" },
  { octaveShift: -12, shade: "dark" },
];

/**
 * A Koala-style pad grid for verifying the master's detected key by ear:
 * column 0 (highlighted) is the tonic, columns 1-6 are the rest of the
 * detected major/minor scale in order, each row an octave. Press and hold a
 * pad to hear that exact pitch — including whatever tuning-mode correction
 * and diagnostic trim a real tuned one-shot dropped into Koala would carry
 * — so a wrong key or scale reads as an obviously wrong-sounding pad
 * instead of a number you have to trust.
 */
export function MasterGrid({
  master,
  tuningMode,
  a4Reference,
  tonicPitchClass,
  scale,
  trimSemitones,
}: {
  master: MasterItem;
  tuningMode: TuningMode;
  a4Reference: number;
  tonicPitchClass: number;
  scale: "major" | "minor";
  trimSemitones: number;
}) {
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const toneRef = useRef<ToneHandle | null>(null);
  const steps = scaleStepsFor(scale);

  const stop = () => {
    toneRef.current?.stop();
    toneRef.current = null;
    setActiveCell(null);
  };

  const press = (row: number, col: number, octaveShift: number) => {
    const freq = scaleGridFrequency(master, tuningMode, a4Reference, col, octaveShift, trimSemitones);
    if (freq === null) return;
    toneRef.current = playTone(freq, 0.35);
    setActiveCell(`${row}-${col}`);
  };

  return (
    <div
      className="key-grid"
      title="Press and hold a pad to hear that scale degree at the target pitch — leftmost column is the tonic"
    >
      {ROWS.map((r, row) => (
        <div className="key-grid__row" key={row}>
          {steps.map((_, col) => {
            const id = `${row}-${col}`;
            const isTonic = col === 0;
            const name = NOTE_NAMES[(tonicPitchClass + steps[col]) % 12];
            return (
              <button
                key={col}
                className={[
                  "key-grid__cell",
                  isTonic && `key-grid__cell--tonic key-grid__cell--${r.shade}`,
                  activeCell === id && "key-grid__cell--active",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(row, col, r.octaveShift);
                }}
                onPointerUp={stop}
                onPointerLeave={stop}
                onPointerCancel={stop}
                onContextMenu={(e) => e.preventDefault()}
                title={`${name}${isTonic ? " — tonic" : ""}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
