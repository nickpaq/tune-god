import { useLayoutEffect, useRef, useState } from "react";
import { PrecisionSlider } from "./PrecisionSlider";
import { ToneKnob } from "./ToneKnob";
import { Waveform } from "./Waveform";
import type { CategoryId } from "../audio/classify";
import type { Detail } from "../audio/padLabels";
import type { GhostKind } from "../audio/ghost";
import { formatTrim, trimCents } from "../audio/theory";
import type { TapGrid } from "../audio/song/tapGrid";
import type { MakerChop, Slot } from "../audio/song/patternMaker";

/** The trim slider reaches 12 semitones either way. */
const TRIM_RANGE_CENTS = 1200;
/**
 * Where the pitch slider stops while the finger is dragged up above its track (over the track it goes by semitones, below it goes fine): the offsets YIN gets a note wrong by, in cents. Its classic mistake is locking onto a
 * harmonic or subharmonic: the 3rd harmonic sits an octave and a fifth up (so the note name is a fifth out: +7, or -5 from the other side) and a tripled
 * period an octave and a fifth down (-7, or +5); an octave error (12) keeps the note name and only matters for the octave it plays in.
 */

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
  section?: { number: number; sourceSampleId: number; bpm: number; beatsPerBar: number; /** Whole bars in the section. */ bars: number; /** The colour it was given in the chop editor, as a place in the selected palette. */ colorIndex?: number; /** The colour (hex) it was given in the chop editor, kept as it was: the section pads keep it whatever palette is chosen later. */ color?: string; /** Semitones the key picked on the piano moves it, written to Koala's pitch knob. */ pitch?: number; /** Made by synced mode (the sample cut into its own sections): labelled "Chop", not "Vox". */ synced?: boolean };
  /** Set on the pad Chopper mode makes: Koala's own chopper holding the whole sample, written to the export as one new pad with the slices in it. */
  chopper?: { sourceSampleId: number; slices: number; bpm: number; beatsPerBar: number; pitch: number; layout: { starts: number[]; sections: { slice: number; bars: number }[] }; color?: string; /** The chops as the pattern maker lists them, and the sequence it made (none until Done). */ maker?: { chops: MakerChop[]; /** The sample's frames to a beat at its own tempo. */ beatFrames: number; grid?: TapGrid; slots?: Slot[] } };
  /** The tempo the file name states ("140bpm"), when it does: a loop of this tempo can be stretched to the project's. */
  bpm?: number;
  /** The key the pad is tuned from was read from its file name (a sure one), not detected from the audio: its pad is shaded darker. */
  keyFromName?: boolean;
  /** The loop is stretched from its own tempo to the project tempo (written to the export as Koala's stretch). */
  stretch?: boolean;
  /** The pad is locked (dragged onto the lock zone): a bank load leaves its sound on the pad and only swaps the hot-swap options for it. */
  locked?: boolean;
  tune: boolean;
  /** A key chosen for this pad alone ("Tune one"); it overrides the project key. */
  keyPc?: number;
  /** Set once the user toggles Tune by hand; "Tune all" then leaves this pad's choice alone. */
  tuneLocked?: boolean;
  /** Manual trim on top of the computed shift. */
  semis: number;
  cents: number;
}

/** A chord name from the app ("C minor"). */
const chordIsMinor = (chord: string) => chord.endsWith("minor");

/** The sound's simplified name; a tap swaps it for the file name, which scrolls to and fro when it is wider than the screen. The choice lives only while the Tune screen does. */
function NameLine({ name, fileName }: { name: string; fileName: string }) {
  const [raw, setRaw] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const shown = raw ? fileName : name;
  useLayoutEffect(() => {
    const overflow = raw && box.current && text.current ? Math.max(0, text.current.scrollWidth - box.current.clientWidth) : 0;
    text.current?.style.setProperty("--scroll", `${overflow}px`);
    text.current?.classList.toggle("name-line__text--scroll", overflow > 0);
  }, [raw, shown]);
  return (
    <button ref={box} type="button" className="name-line" onClick={() => setRaw((r) => !r)} aria-label={raw ? `File name ${fileName}: tap for the short name` : `${name}: tap for the file name`}>
      <span ref={text} className="name-line__text">
        {shown}
      </span>
    </button>
  );
}

/** What the OLED shows for the selected pad in Tune mode: the key it follows, the tune switch, the shift, the waveform and the trim slider. */
export function PadPanel({
  pad,
  name,
  autoShift,
  keyName,
  needsKey,
  chords,
  relative,
  onRelative,
  projectBpm,
  onTrim,
  onHoldStart,
  onHoldEnd,
  toneVolume,
  onToneVolume,
  toneOn,
  onChange,
}: {
  pad: Pad;
  /** The simplified name of the sound; tapping it shows the file name (until the Tune screen is left). */
  name: string;
  /** Semitones the automatic tuning moves this pad; the panel adds the manual trim for display. */
  autoShift: number;
  /** The note the pad is tuned to ("C#"), or "--" when tuning is off. */
  keyName: string;
  /** No key is chosen yet, so there is no tone to hold the sound against: the slider is locked. */
  needsKey: boolean;
  /** For a melodic loop: the reference chord of the project's key and of its relative key (e.g. "C minor", "D# major"); null for any other sound. */
  chords: [string, string] | null;
  /** The reference is the relative key's chord (picked with the squares shown while the slider is dragged up). */
  relative: boolean;
  onRelative: (relative: boolean) => void;
  /** The project tempo: what a stretched loop goes to. */
  projectBpm: number;
  /** The pitch slider moved: the pad's pitch trim, in cents. */
  onTrim: (cents: number) => void;
  /** The slider was grabbed: the pad loops with a tone on the key, until it is let go. */
  onHoldStart: () => void;
  /** The slider was let go: the sound and the tone stop. */
  onHoldEnd: () => void;
  /** The tone's volume knob (0 to 1), drawn on the screen at the right of the top row, and whether the tone is switched on (the knob dims when it is not). */
  toneVolume: number;
  onToneVolume: (volume: number) => void;
  toneOn: boolean;
  onChange: (patch: Partial<Pick<Pad, "tune" | "semis" | "cents" | "stretch">>) => void;
}) {
  const trim = Math.max(-TRIM_RANGE_CENTS, Math.min(TRIM_RANGE_CENTS, trimCents(pad.semis, pad.cents)));
  const total = autoShift + trim / 100;
  const isLoop = chords !== null;
  const isLoopSound = pad.category === "melodicLoop" || pad.category === "drumLoop";
  /** The two squares (minor left, major right) are shown while the slider is dragged up. */
  const [above, setAbove] = useState(false);
  const boxes = useRef<(HTMLDivElement | null)[]>([]);
  const shown = chords ? chords[relative ? 1 : 0] : null;

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
          </div>
          <div>Shift {pad.tune ? formatTrim(total * 100) : "0.000"}st</div>
        </div>
        <ToneKnob value={toneVolume} onChange={onToneVolume} dim={!toneOn} />
      </div>
      <NameLine name={name} fileName={pad.name} />
      {(pad.bpm || isLoopSound) && (
        <div className="pad-panel__toggles pad-panel__tempo">
          <span aria-label="Tempo of the sound">{pad.bpm ? (pad.stretch ? `${pad.bpm}>${projectBpm}` : pad.bpm) : "--"} BPM</span>
          <button
            className={`tune-toggle${pad.stretch ? " tune-toggle--on" : ""}`}
            disabled={!pad.bpm}
            onClick={() => onChange({ stretch: !pad.stretch })}
            aria-pressed={!!pad.stretch}
            title="Stretch the loop from its own tempo (from its file name) to the project tempo, without changing its pitch. Needs a tempo in the file name."
          >
            Stretch
          </button>
        </div>
      )}

      <Waveform channelData={pad.channelData} />

      <div className="pad-panel__slider">
        <PrecisionSlider
          min={-TRIM_RANGE_CENTS}
          max={TRIM_RANGE_CENTS}
          step={0.1}
          keyStep={10}
          fineSpan={10}
          coarseStep={100}
          onAbove={(point) => {
            if (!isLoop) return;
            setAbove(point !== null);
            if (!point) return;
            for (const [i, box] of boxes.current.entries()) {
              const r = box?.getBoundingClientRect();
              if (r && point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) onRelative((i === 0) !== chordIsMinor(chords![0]));
            }
          }}
          value={trim}
          bipolar
          disabled={needsKey}
          onChange={onTrim}
          onDragStart={onHoldStart}
          onDragEnd={onHoldEnd}
          onDoubleClick={() => onChange({ semis: 0, cents: 0 })}
          valueLabel={(cents) => formatTrim(pad.tune ? autoShift * 100 + cents : cents)}
          title="Pitch of the sound: hold and slide along the slider to repitch it by semitones, drag down for fine steps. Drag up: a melodic loop is played against its relative key (a minor key's relative major, a major key's relative minor); any other sound stops on the offsets a pitch detector gets wrong by (fifths and octaves). The sound and the reference play only while you hold. Double-tap to reset."
        />
        {chords && above && (
          <>
            {(["minor", "major"] as const).map((kind, i) => {
              const chord = chords.find((c) => c.endsWith(kind)) ?? "";
              return (
                <div key={kind} ref={(el) => { boxes.current[i] = el; }} className={`chord-box chord-box--${kind}${shown?.endsWith(kind) ? " chord-box--on" : ""}`}>
                  <span>{kind}</span>
                  <b>{chord.split(" ")[0]}</b>
                </div>
              );
            })}
          </>
        )}
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
