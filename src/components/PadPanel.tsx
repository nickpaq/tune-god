import { PrecisionSlider } from "./PrecisionSlider";
import { CATEGORIES, type CategoryId } from "../audio/classify";
import { formatSignedCents, formatSignedSemitones } from "../audio/theory";

export interface Pad {
  /** 0-based grid slot across all four banks. */
  index: number;
  /** The sample's id inside the .koala project, used when writing tuned audio back. */
  sampleId: number;
  sampleRate: number;
  channelData: Float32Array[];
  /** Fractional MIDI of the detected root; null = no clear pitch, undefined = still analyzing. */
  detectedMidi?: number | null;
  /** Guessed (or manually chosen) sound category, used for auto-colouring. */
  category?: CategoryId;
  tune: boolean;
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
  /** Semitones the automatic tuning moved this pad (excludes manual slider trim). */
  autoShift: number;
  /** Shows the sound-category dropdown. */
  autoColor: boolean;
  onChange: (patch: Partial<Pick<Pad, "tune" | "semis" | "cents" | "category">>) => void;
}) {
  const status = pad.tune ? `✓ Tuned ${autoShift >= 0 ? "+" : "−"}${Math.abs(autoShift).toFixed(2)} st` : "Not tuned";

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
          {pad.tune ? "🎹 Tune" : "🥁 Don't tune"}
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
                {c.label} ({c.koalaLabel})
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
