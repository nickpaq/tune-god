import { useState } from "react";
import { scaleGridFrequency, scaleStepsFor } from "../state/samplesStore";
import { NOTE_NAMES } from "../audio/theory";

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
 * A Koala-style pad grid for verifying the master's key by ear: column 0
 * (highlighted) is the tonic, columns 1-6 are the rest of the chosen
 * major/minor scale in order, each row an octave. Press and hold a pad to
 * hear that exact pitch, anchored to the by-ear tonic frequency plus an
 * optional diagnostic trim — so a wrong key or scale choice reads as an
 * obviously wrong-sounding pad instead of a number you have to trust. The
 * scale switch (major/minor) lives in MasterPanel; this just renders
 * whichever one is passed in.
 */
export function MasterGrid({
  tonicFrequencyHz,
  tonicPitchClass,
  scale,
  trimSemitones,
  onPressNote,
  onReleaseNote,
}: {
  tonicFrequencyHz: number;
  tonicPitchClass: number;
  scale: "major" | "minor";
  trimSemitones: number;
  /** Starts (or retunes) the manually-played drone note at this frequency. */
  onPressNote: (frequency: number) => void;
  /** Stops the manually-played drone note. */
  onReleaseNote: () => void;
}) {
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const steps = scaleStepsFor(scale);

  const stop = () => {
    onReleaseNote();
    setActiveCell(null);
  };

  const press = (row: number, col: number, octaveShift: number) => {
    const freq = scaleGridFrequency(tonicFrequencyHz, scale, col, octaveShift, trimSemitones);
    onPressNote(freq);
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
                aria-label={`${name}${isTonic ? " — tonic" : ""}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
