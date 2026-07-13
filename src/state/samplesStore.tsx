import React, { createContext, useContext, useMemo, useReducer } from "react";
import type { SampleAnalysis } from "../audio/analysisTypes";
import { smallestSignedShift, semitonesToRatio, midiToFrequency } from "../audio/theory";
import type { ParsedKoalaProject } from "../audio/koalaProject";
import { guessSampleMode } from "../audio/sampleModeDetect";

/**
 * Which side of each row's controls the play button sits on. "right" is for
 * right-handed use (thumb naturally falls on the left side of the screen
 * when the phone is held in the right hand) — "left" is the default,
 * matching the button's original position on the right.
 */
export type Handedness = "left" | "right";

const HANDEDNESS_STORAGE_KEY = "koalatune.handedness";

function loadHandedness(): Handedness {
  try {
    const stored = localStorage.getItem(HANDEDNESS_STORAGE_KEY);
    return stored === "right" ? "right" : "left";
  } catch {
    return "left";
  }
}

export function saveHandedness(handedness: Handedness): void {
  try {
    localStorage.setItem(HANDEDNESS_STORAGE_KEY, handedness);
  } catch {
    // Best-effort — private browsing / storage quota, etc.
  }
}

/**
 * "loop": tuned and time-stretched to the master's BPM via Rubber Band —
 * preserves exact duration and formants.
 * "oneshot": tuned via a simple resample (pitch-shift only) — no Rubber
 * Band, no formant preservation, no BPM matching; duration drifts with
 * pitch but transients stay crisp.
 * "bass": processed identically to "oneshot" (same resample, no time
 * ratio) — the only difference is in preview: the audition drone/sample
 * are transposed up 3 octaves, making a low-fundamental easier to hear/tune
 * by ear. Never affects the actual exported audio.
 * "drum": left completely untouched.
 */
export type SampleMode = "loop" | "oneshot" | "bass" | "drum";
export type SampleStatus = "pending" | "analyzing" | "analyzed" | "processing" | "done" | "error";

export interface SampleItem {
  id: string;
  file: File;
  name: string;
  sampleRate: number;
  channelData: Float32Array[];
  status: SampleStatus;
  error?: string;
  analysis?: SampleAnalysis;
  mode: SampleMode;
  /** Computed once the master's tonic (pitch class + by-ear frequency) and this sample's own analysis are both known. */
  pitchShiftSemitones?: number;
  /** Only meaningful for "loop" — the resample path used for "oneshot" ignores it. */
  timeRatio?: number;
  processedChannelData?: Float32Array[];
  /** Set when this sample came from a pad in an imported .koala project. */
  koalaSampleId?: number;
  /** True once the user has explicitly picked a mode — stops auto-detection from overwriting their choice. */
  modeManuallySet?: boolean;
  /**
   * User trim folded into the computed shift — the escape hatch when
   * detection got the root wrong. Also where the post-render verify pass
   * (see `renderSample` in useAppActions.ts) folds in its own correction: it
   * re-measures the rendered audio's pitch and silently nudges this value by
   * whatever cents error it finds, then re-renders — so this can end up
   * slightly different from whatever the user last dragged the sliders to.
   */
  manualOffsetSemitones?: number;
}

export interface MasterItem {
  file: File;
  name: string;
  sampleRate: number;
  channelData: Float32Array[];
  /** Tonic pitch class (0=C..11=B) — set by the user (pre-filled from the filename when parseable), never auto-detected. */
  tonicPitchClass?: number;
  /** Set by the user by ear (which scale the keyboard's 7 degrees sound right in), never auto-detected. */
  scale?: "major" | "minor";
  /** Set by the user (pre-filled from the filename when parseable), never auto-detected. */
  bpm?: number;
  /**
   * The tonic's *actual* frequency, tuned by ear against the master loop
   * using the tone generator's "Play Root" drone — this loop may not sit at
   * a clean equal-tempered pitch at all, so this is the real ground truth
   * every sample gets tuned to, not a value derived from `tonicPitchClass`.
   * Defaults to the standard equal-tempered frequency for `tonicPitchClass`
   * (nearest middle C) whenever the tonic changes, as a starting point.
   */
  tonicFrequencyHz?: number;
  koalaSampleId?: number;
}

interface State {
  master: MasterItem | null;
  samples: SampleItem[];
  koalaProject: ParsedKoalaProject | null;
  handedness: Handedness;
}

type Action =
  | { type: "SET_MASTER"; master: MasterItem }
  | { type: "SET_MASTER_KEY"; tonicPitchClass?: number; scale?: "major" | "minor"; bpm?: number }
  | { type: "SET_MASTER_TONIC_FREQUENCY"; hz: number }
  | { type: "ADD_SAMPLES"; samples: SampleItem[] }
  | { type: "REMOVE_SAMPLE"; id: string }
  | { type: "SET_SAMPLE_STATUS"; id: string; status: SampleStatus; error?: string }
  | { type: "SET_SAMPLE_ANALYSIS"; id: string; analysis: SampleAnalysis }
  | { type: "SET_SAMPLE_MODE"; id: string; mode: SampleMode }
  | { type: "SET_SAMPLE_PROCESSED"; id: string; channelData: Float32Array[] }
  | { type: "SET_SAMPLE_MANUAL_OFFSET"; id: string; semitones: number }
  | { type: "SET_KOALA_PROJECT"; project: ParsedKoalaProject | null }
  | { type: "SET_HANDEDNESS"; handedness: Handedness }
  | { type: "CLEAR_MASTER" }
  | { type: "RESET" };

function effectiveMasterKey(master: MasterItem): { tonicPitchClass: number; scale: "major" | "minor" } | null {
  if (master.tonicPitchClass === undefined || master.scale === undefined) return null;
  return { tonicPitchClass: master.tonicPitchClass, scale: master.scale };
}

/** Standard equal-tempered frequency for a pitch class, voiced in the octave nearest middle C — the tone generator's starting point before the user nudges it by ear. */
export function standardTonicFrequency(tonicPitchClass: number): number {
  return midiToFrequency(60 + smallestSignedShift(0, tonicPitchClass));
}

/**
 * Nearest octave-multiple of `tonicFrequencyHz` to `frequency` — i.e. the
 * tonic, transposed into whichever octave sits closest to the given
 * frequency. Frequency-based rather than pitch-class/MIDI-based, since the
 * tonic's own Hz is a manually ear-tuned value that need not land on a
 * clean equal-tempered grid at all.
 */
function nearestTonicOctave(tonicFrequencyHz: number, frequency: number): number {
  const n = Math.round(Math.log2(frequency / tonicFrequencyHz));
  return tonicFrequencyHz * Math.pow(2, n);
}

/**
 * Semitone shift that lands a sample's detected fundamental on the nearest
 * possible tonic *in its own original octave* — i.e. the smallest move, not
 * a jump to some canonical octave. Undefined until the master has both a
 * tonic pitch class (for display/keyboard purposes) and a by-ear tonic
 * frequency (the actual tuning target).
 */
function computeShiftSemitones(master: MasterItem, sample: SampleAnalysis): number | undefined {
  if (!effectiveMasterKey(master) || master.tonicFrequencyHz === undefined) return undefined;
  const target = nearestTonicOctave(master.tonicFrequencyHz, sample.frequency);
  return 12 * Math.log2(target / sample.frequency);
}

/**
 * Signed cents error of a measured frequency vs the nearest tonic octave to
 * it — octave-agnostic, since "in tune" just means landing on *a* tonic
 * octave, not a specific one. Null until the master has a by-ear tonic
 * frequency.
 */
export function verifyErrorCents(master: MasterItem, measuredFrequency: number): number | null {
  if (master.tonicFrequencyHz === undefined) return null;
  const target = nearestTonicOctave(master.tonicFrequencyHz, measuredFrequency);
  return 1200 * Math.log2(measuredFrequency / target);
}

/**
 * Frequency for a per-sample verification drone: the tonic, voiced in the
 * octave nearest where the tuned sample actually sits (*without* the
 * sample's manual trim — the drone is the truth to tune toward).
 */
export function droneFrequency(master: MasterItem, sample: SampleItem): number | null {
  if (master.tonicFrequencyHz === undefined || !sample.analysis) return null;
  const tunedFrequency = sample.analysis.frequency * semitonesToRatio(sample.pitchShiftSemitones ?? 0);
  return nearestTonicOctave(master.tonicFrequencyHz, tunedFrequency);
}

/** Semitone offsets from the tonic for each of the 7 scale degrees, index 0 = tonic. */
export const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
export const NATURAL_MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

export function scaleStepsFor(scale: "major" | "minor"): readonly number[] {
  return scale === "minor" ? NATURAL_MINOR_SCALE_STEPS : MAJOR_SCALE_STEPS;
}

/**
 * Frequency for one pad of the master-key verification grid: scale degree
 * `col` (0 = tonic, 1..6 = the rest of the chosen major/minor scale in
 * order) voiced `octaveShift` semitones from the by-ear tonic frequency,
 * plus an optional diagnostic trim — so a pad sounds exactly like a
 * one-shot tuned to that degree and dropped into Koala would, letting a
 * wrong key/scale choice surface by ear immediately.
 */
export function scaleGridFrequency(
  tonicFrequencyHz: number,
  scale: "major" | "minor",
  col: number,
  octaveShift: number,
  trimSemitones = 0,
): number {
  const steps = scaleStepsFor(scale);
  const degree = steps[col] ?? 0;
  return tonicFrequencyHz * semitonesToRatio(degree + octaveShift + trimSemitones);
}

function withComputedShift(master: MasterItem | null, sample: SampleItem): SampleItem {
  if (!master || !sample.analysis) return sample;
  const baseShift = computeShiftSemitones(master, sample.analysis);
  const pitchShiftSemitones = baseShift === undefined ? undefined : baseShift + (sample.manualOffsetSemitones ?? 0);
  const timeRatio = sample.mode === "loop" && sample.analysis.bpm && master.bpm ? master.bpm / sample.analysis.bpm : 1;

  // If this sample was already rendered but the target has since moved (key
  // change, tonic frequency nudge, mode toggle...), the render is stale:
  // drop it so previews fall back to the original audio and the UI shows
  // the sample as needing processing again.
  const changed = (a?: number, b?: number) =>
    (a === undefined) !== (b === undefined) || (a !== undefined && b !== undefined && Math.abs(a - b) > 1e-9);
  const stale =
    sample.processedChannelData &&
    (changed(pitchShiftSemitones, sample.pitchShiftSemitones) || changed(timeRatio, sample.timeRatio));

  return {
    ...sample,
    pitchShiftSemitones,
    timeRatio,
    ...(stale ? { processedChannelData: undefined, status: "analyzed" as SampleStatus } : {}),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_MASTER":
      return { ...state, master: action.master };
    case "SET_MASTER_KEY": {
      if (!state.master) return state;
      // Changing which pitch class is the tonic resets the by-ear-tuned
      // frequency back to a sane standard-tuning default for the new note —
      // the old fine-tuned Hz value was for a different note entirely.
      const tonicChanged = action.tonicPitchClass !== state.master.tonicPitchClass;
      const master: MasterItem = {
        ...state.master,
        tonicPitchClass: action.tonicPitchClass,
        scale: action.scale,
        bpm: action.bpm,
        tonicFrequencyHz:
          tonicChanged && action.tonicPitchClass !== undefined
            ? standardTonicFrequency(action.tonicPitchClass)
            : state.master.tonicFrequencyHz,
      };
      return { ...state, master, samples: state.samples.map((s) => withComputedShift(master, s)) };
    }
    case "SET_MASTER_TONIC_FREQUENCY": {
      if (!state.master) return state;
      const master = { ...state.master, tonicFrequencyHz: action.hz };
      return { ...state, master, samples: state.samples.map((s) => withComputedShift(master, s)) };
    }
    case "ADD_SAMPLES":
      return { ...state, samples: [...state.samples, ...action.samples] };
    case "REMOVE_SAMPLE":
      return { ...state, samples: state.samples.filter((s) => s.id !== action.id) };
    case "SET_SAMPLE_STATUS":
      return {
        ...state,
        samples: state.samples.map((s) =>
          s.id === action.id ? { ...s, status: action.status, error: action.error } : s,
        ),
      };
    case "SET_SAMPLE_ANALYSIS":
      return {
        ...state,
        samples: state.samples.map((s) => {
          if (s.id !== action.id) return s;
          const mode = s.modeManuallySet ? s.mode : guessSampleMode(s.name, action.analysis);
          return withComputedShift(state.master, { ...s, analysis: action.analysis, status: "analyzed", mode });
        }),
      };
    case "SET_SAMPLE_MODE":
      return {
        ...state,
        samples: state.samples.map((s) =>
          s.id === action.id
            ? withComputedShift(state.master, { ...s, mode: action.mode, modeManuallySet: true })
            : s,
        ),
      };
    case "SET_SAMPLE_PROCESSED":
      return {
        ...state,
        samples: state.samples.map((s) =>
          s.id === action.id ? { ...s, processedChannelData: action.channelData, status: "done" } : s,
        ),
      };
    case "SET_SAMPLE_MANUAL_OFFSET":
      return {
        ...state,
        samples: state.samples.map((s) =>
          s.id === action.id
            ? withComputedShift(state.master, { ...s, manualOffsetSemitones: action.semitones })
            : s,
        ),
      };
    case "SET_KOALA_PROJECT":
      return { ...state, koalaProject: action.project };
    case "SET_HANDEDNESS":
      saveHandedness(action.handedness);
      return { ...state, handedness: action.handedness };
    case "CLEAR_MASTER":
      return {
        ...state,
        master: null,
        samples: state.samples.map((s) => ({
          ...s,
          pitchShiftSemitones: undefined,
          timeRatio: undefined,
          processedChannelData: undefined,
          status: s.analysis ? "analyzed" : s.status,
        })),
      };
    case "RESET":
      return { master: null, samples: [], koalaProject: null, handedness: state.handedness };
    default:
      return state;
  }
}

const StoreContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function SamplesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    master: null,
    samples: [],
    koalaProject: null,
    handedness: loadHandedness(),
  });
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSamplesStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useSamplesStore must be used within SamplesProvider");
  return ctx;
}

export interface TargetInfo {
  tonicPitchClass: number;
  /** Also the pitch class samples are tuned to — every key now tunes to the literal tonic. */
  tonicName: string;
  scale: "major" | "minor";
}

export function useTargetInfo(master: MasterItem | null): TargetInfo | null {
  return useMemo(() => {
    if (!master) return null;
    const key = effectiveMasterKey(master);
    if (!key) return null;
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return {
      tonicPitchClass: key.tonicPitchClass,
      tonicName: names[key.tonicPitchClass],
      scale: key.scale,
    };
  }, [master]);
}

export { semitonesToRatio };
