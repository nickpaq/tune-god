import { PrecisionSlider } from "./PrecisionSlider";
import { CATEGORIES, type CategoryId } from "../audio/classify";
import type { Detail } from "../audio/padLabels";
import type { GhostKind } from "../audio/ghost";
import { formatSignedCents, formatSignedSemitones } from "../audio/theory";

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
  /** A long or looped/stretched sound: already prepared, so Tune stays off unless the user turns it on. */
  loop?: boolean;
  tune: boolean;
  /** Set once the user toggles Tune by hand; "Tune all" then leaves this pad's choice alone. */
  tuneLocked?: boolean;
  /** Manual trim on top of the computed shift. */
  semis: number;
  cents: number;
}

/** What the teal section shows for the selected pad: tune toggle and the two trim sliders. */
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
  const total = autoShift + pad.semis + pad.cents / 100;
  const status = pad.tune ? `✓ Tuned ${total >= 0 ? "+" : "−"}${Math.abs(total).toFixed(2)}` : "Not tuned";

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
          <span>Semitones</span>
          <span>{formatSignedSemitones(pad.semis)}</span>
        </div>
        <PrecisionSlider
          min={-12}
          max={12}
          step={1}
          value={pad.semis}
          bipolar
          onChange={(semis) => onChange({ semis })}
          onDoubleClick={() => onChange({ semis: 0 })}
          valueLabel={formatSignedSemitones}
          title="Semitone trim. Drag down to slow the scrub. Double-tap to reset."
        />
      </div>

      <div className={`pad-panel__slider${pad.tune ? "" : " pad-panel__slider--off"}`}>
        <div className="pad-panel__label">
          <span>Cents</span>
          <span>{formatSignedCents(pad.cents)}</span>
        </div>
        <PrecisionSlider
          min={-50}
          max={50}
          step={1}
          value={pad.cents}
          bipolar
          onChange={(cents) => onChange({ cents })}
          onDoubleClick={() => onChange({ cents: 0 })}
          valueLabel={formatSignedCents}
          title="Fine cents trim. Drag down to slow the scrub. Double-tap to reset."
        />
      </div>
    </div>
  );
}
