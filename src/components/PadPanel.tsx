import { PrecisionSlider } from "./PrecisionSlider";
import { Waveform } from "./Waveform";
import type { CategoryId } from "../audio/classify";
import type { Detail } from "../audio/padLabels";
import type { GhostKind } from "../audio/ghost";
import { formatTrim, trimCents } from "../audio/theory";

/** The trim slider reaches 12 semitones either way. */
const TRIM_RANGE_CENTS = 1200;
/**
 * Where the pitch slider stops while the finger is dragged up above its track (over the track it goes by semitones, below it goes fine): the offsets YIN gets a note wrong by, in cents. Its classic mistake is locking onto a
 * harmonic or subharmonic: the 3rd harmonic sits an octave and a fifth up (so the note name is a fifth out: +7, or -5 from the other side) and a tripled
 * period an octave and a fifth down (-7, or +5); an octave error (12) keeps the note name and only matters for the octave it plays in.
 */
const YIN_MISTAKES_CENTS = [-1200, -700, -500, 0, 500, 700, 1200];

export interface Pad {
  /** 0-based grid slot across all four banks; changes when the pad is moved. */
  index: number;
  /** The slot this sound had in the loaded project. Never changes, so it identifies the sound. */
  origIndex: number;
  /** The sample's file name in the project, shown in the classifier. */
  name: string;
  /** The label on the pad in Koala, when the project had one: it is what a vocal stem is found by (see audio/song/stems.ts). */
  label?: string;
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
  /** The pad knob's level in dB for a sound from a sample pack, whose audio already holds its loudness gain; preview plays at this level. */
  knobDb?: number;
  /** A bass sound that is an 808 (by its name or folder); a sample pack keeps two of these and two ordinary basses on bank C. */
  is808?: boolean;
  /** Set on a pad that is one section of a chopped song: made from the song's pad, written to the export as a new pad with a pattern of its own. */
  section?: { number: number; sourceSampleId: number; bpm: number; beatsPerBar: number; /** Whole bars in the section. */ bars: number; /** The colour it was given in the chop editor, as a place in the selected palette. */ colorIndex?: number; /** The colour (hex) it was given in the chop editor, kept as it was: the section pads keep it whatever palette is chosen later. */ color?: string };
  tune: boolean;
  /** A key chosen for this pad alone ("Tune one"); it overrides the project key. */
  keyPc?: number;
  /** Set once the user toggles Tune by hand; "Tune all" then leaves this pad's choice alone. */
  tuneLocked?: boolean;
  /** Manual trim on top of the computed shift. */
  semis: number;
  cents: number;
}

/** What the OLED shows for the selected pad in Tune mode: the key it follows, the tune switch, the shift, the waveform and the trim slider. */
export function PadPanel({
  pad,
  autoShift,
  keyName,
  needsKey,
  keyMajor,
  onKeyMajor,
  onTrim,
  onHoldStart,
  onHoldEnd,
  onChange,
}: {
  pad: Pad;
  /** Semitones the automatic tuning moves this pad; the panel adds the manual trim for display. */
  autoShift: number;
  /** The note the pad is tuned to ("C#"), or "--" when tuning is off. */
  keyName: string;
  /** No key is chosen yet, so there is no tone to hold the sound against: the slider is locked. */
  needsKey: boolean;
  /** The piano's key is a major key (default: minor). It sets the chord a melodic loop is judged against and where the loop is moved to. */
  keyMajor: boolean;
  onKeyMajor: (major: boolean) => void;
  /** The pitch slider moved: the pad's pitch trim, in cents. */
  onTrim: (cents: number) => void;
  /** The slider was grabbed: the pad loops with a tone on the key, until it is let go. */
  onHoldStart: () => void;
  /** The slider was let go: the sound and the tone stop. */
  onHoldEnd: () => void;
  onChange: (patch: Partial<Pick<Pad, "tune" | "semis" | "cents">>) => void;
}) {
  const trim = Math.max(-TRIM_RANGE_CENTS, Math.min(TRIM_RANGE_CENTS, trimCents(pad.semis, pad.cents)));
  const total = autoShift + trim / 100;

  return (
    <div className="pad-panel">
      <div className="pad-panel__top">
        <div className="pad-panel__note" aria-label="Tuned to">
          {keyName}
        </div>
        <div className="pad-panel__lines">
          <div className="pad-panel__toggles">
            <button
              className={`tune-toggle${pad.tune ? " tune-toggle--on" : ""}`}
              onClick={() => onChange({ tune: !pad.tune })}
              aria-pressed={pad.tune}
            >
              {pad.tune ? "Tune on" : "Tune off"}
            </button>
            <button
              className="tune-toggle"
              onClick={() => onKeyMajor(!keyMajor)}
              aria-label={`The key is ${keyMajor ? "major" : "minor"}: tap to switch`}
              title="Major or minor: the chord a melodic loop is played against, and the key it is moved to (a major key takes the loop to its relative minor, a minor third below)."
            >
              {keyMajor ? "Major" : "Minor"}
            </button>
          </div>
          <div>Shift {pad.tune ? `${total >= 0 ? "+" : "-"}${Math.abs(total).toFixed(2)}` : "0.00"}st</div>
          <div>Trim {formatTrim(trim)}st</div>
        </div>
      </div>

      <Waveform channelData={pad.channelData} />

      <div className="pad-panel__slider">
        <PrecisionSlider
          min={-TRIM_RANGE_CENTS}
          max={TRIM_RANGE_CENTS}
          step={1}
          keyStep={10}
          fineSpan={100}
          coarseStep={100}
          coarseStops={YIN_MISTAKES_CENTS}
          value={trim}
          bipolar
          disabled={needsKey}
          onChange={onTrim}
          onDragStart={onHoldStart}
          onDragEnd={onHoldEnd}
          onDoubleClick={() => onChange({ semis: 0, cents: 0 })}
          valueLabel={formatTrim}
          title="Pitch of the sound: hold and slide along the slider to repitch it by semitones, drag up for the offsets a pitch detector gets wrong by (fifths and octaves), drag down for fine steps. The sound and a tone on the key play only while you hold. Double-tap to reset."
        />
        <div className="pad-panel__scale">
          {needsKey ? (
            <span>Select a key first</span>
          ) : (
            <>
              <span>-12st</span>
              <span>+12st</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
