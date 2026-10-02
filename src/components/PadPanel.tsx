import { PrecisionSlider } from "./PrecisionSlider";
import { Waveform } from "./Waveform";
import { CATEGORIES, type CategoryId } from "../audio/classify";
import type { Detail } from "../audio/padLabels";
import type { GhostKind } from "../audio/ghost";
import { formatTrim, splitTrim, trimCents } from "../audio/theory";

/** The trim slider reaches 12 semitones either way. */
const TRIM_RANGE_CENTS = 1200;

export interface Pad {
  /** 0-based grid slot across all four banks; changes when the pad is moved. */
  index: number;
  /** The slot this sound had in the loaded project. Never changes, so it identifies the sound. */
  origIndex: number;
  /** The sample's file name in the project, shown in the classifier. */
  name: string;
  /** The sample's id inside the .koala project, used when writing tuned audio back. */
  sampleId: number;
  sampleRate: number;
  channelData: Float32Array[];
  /** Frames cut from the front of the file on load (Koala's start point); set only when the audio was truncated. */
  trimmedFrom?: number;
  /** Fractional MIDI of the detected root; null = no clear pitch, undefined = still analyzing. */
  detectedMidi?: number | null;
  /** Guessed (or manually chosen) sound category, used for auto-colouring. */
  category?: CategoryId;
  /** Finer label for non-drum sounds (Piano, Riser, ...) from the file name; display only. */
  detail?: Detail;
  /** Spectral centroid in Hz, used to order sounds with no clear pitch. */
  centroid?: number;
  /** Set on the silent pads the finger-drumming layout adds; they have no project sample behind them. */
  placeholder?: { kind: "missing" | "empty"; label: string };
  /** Set on a ghost snare or soft kick: a quieter, duller copy of another sound, made when a finger-drumming layout is applied. */
  ghost?: { kind: GhostKind; sourceOrigIndex: number };
  tune: boolean;
  /** A key chosen for this pad alone ("Tune one"); it overrides the project key. */
  keyPc?: number;
  /** Set once the user toggles Tune by hand; "Tune all" then leaves this pad's choice alone. */
  tuneLocked?: boolean;
  /** Manual trim on top of the computed shift. */
  semis: number;
  cents: number;
}

/** What the screen shows for the selected pad: tune toggle and the two trim sliders. */
export function PadPanel({
  pad,
  autoShift,
  autoColor,
  onChange,
}: {
  pad: Pad;
  /** Semitones the automatic tuning moves this pad; the panel adds the manual trim for display. */
  autoShift: number;
  /** Shows the sound-category dropdown. */
  autoColor: boolean;
  onChange: (patch: Partial<Pick<Pad, "tune" | "semis" | "cents" | "category">>) => void;
}) {
  const trim = Math.max(-TRIM_RANGE_CENTS, Math.min(TRIM_RANGE_CENTS, trimCents(pad.semis, pad.cents)));
  const total = autoShift + trim / 100;
  // While tuning is off the button already says so, so the line under the title names the sound type instead.
  const status = pad.tune
    ? `Tuned ${total >= 0 ? "+" : "−"}${Math.abs(total).toFixed(2)} st`
    : (CATEGORIES.find((c) => c.id === pad.category)?.label ?? "");

  return (
    <div className="pad-panel">
      <div className="pad-panel__head">
        <div>
          <div className="pad-panel__title">PAD {(pad.index % 16) + 1}</div>
          <div className="pad-panel__sub">{status}</div>
        </div>
        <button
          className={`tune-toggle${pad.tune ? " tune-toggle--on" : ""}`}
          onClick={() => onChange({ tune: !pad.tune })}
          aria-pressed={pad.tune}
        >
          {pad.tune ? "Tune: on" : "Tune: off"}
        </button>
      </div>

      <Waveform channelData={pad.channelData} />

      {autoColor && (
        <label className="pad-panel__category">
          <span>Sound type</span>
          <select
            value={pad.category ?? "other"}
            onChange={(e) => onChange({ category: e.target.value as CategoryId })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={`pad-panel__slider${pad.tune ? "" : " pad-panel__slider--off"}`}>
        <div className="pad-panel__label">
          <span>Pitch trim</span>
          <span>{formatTrim(trim)} st</span>
        </div>
        <PrecisionSlider
          min={-TRIM_RANGE_CENTS}
          max={TRIM_RANGE_CENTS}
          step={1}
          keyStep={10}
          fineSpan={100}
          value={trim}
          bipolar
          onChange={(cents) => onChange(splitTrim(cents))}
          onDoubleClick={() => onChange({ semis: 0, cents: 0 })}
          valueLabel={formatTrim}
          title="Pitch trim. Drag down to slow the scrub: at the bottom of the screen the whole track is one semitone. Double-tap to reset."
        />
      </div>
    </div>
  );
}
