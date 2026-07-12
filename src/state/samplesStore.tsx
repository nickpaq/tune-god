import React, { createContext, useContext, useMemo, useReducer } from "react";
import type { MasterAnalysis, SampleAnalysis } from "../audio/analysisTypes";
import {
  smallestSignedShift,
  pitchClassOf,
  semitonesToRatio,
  clampA4Reference,
  referenceOffsetSemitones,
} from "../audio/theory";
import type { ParsedKoalaProject } from "../audio/koalaProject";
import { guessSampleMode } from "../audio/sampleModeDetect";

/**
 * "master": the master loop's audio is left completely untouched. Its key
 * and detune are only *detected*, not corrected — samples are tuned to the
 * tonic and then get that same detune applied, so they match the loop's
 * actual (possibly imperfect) pitch.
 * "a440": the master loop itself is also retuned, precisely onto its
 * detected tonic at an editable, standard-range A4 reference pitch, and
 * samples are tuned to that same clean tonic/reference — so everything
 * (master included) ends up at true, correct pitch.
 */
export type TuningMode = "master" | "a440";

/**
 * "loop": tuned and time-stretched to the master's BPM via Rubber Band —
 * preserves exact duration and formants.
 * "oneshot": tuned via a simple resample (pitch-shift only) — no Rubber
 * Band, no formant preservation, no BPM matching; duration drifts with
 * pitch but transients stay crisp.
 * "drum": left completely untouched.
 */
export type SampleMode = "loop" | "oneshot" | "drum";
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
  /** Computed once master + analysis are both known. */
  pitchShiftSemitones?: number;
  /** Only meaningful for "loop" — the resample path used for "oneshot" ignores it. */
  timeRatio?: number;
  processedChannelData?: Float32Array[];
  /** Set when this sample came from a pad in an imported .koala project. */
  koalaSampleId?: number;
  /** True once the user has explicitly picked a mode — stops auto-detection from overwriting their choice. */
  modeManuallySet?: boolean;
}

export interface MasterItem {
  file: File;
  name: string;
  sampleRate: number;
  channelData: Float32Array[];
  status: SampleStatus;
  analysis?: MasterAnalysis;
  /** Override in case detection is wrong — pre-filled from the filename when parseable, editable, revertible to analysis. */
  overrideTonicPitchClass?: number;
  overrideScale?: "major" | "minor";
  overrideBpm?: number;
  koalaSampleId?: number;
}

interface State {
  master: MasterItem | null;
  samples: SampleItem[];
  koalaProject: ParsedKoalaProject | null;
  tuningMode: TuningMode;
  /** A4 reference in Hz, only used when tuningMode is "a440". Clamped to A4_REFERENCE_RANGE. */
  a4Reference: number;
}

type Action =
  | { type: "SET_MASTER"; master: MasterItem }
  | { type: "SET_MASTER_ANALYSIS"; analysis: MasterAnalysis }
  | { type: "SET_MASTER_OVERRIDE"; tonicPitchClass?: number; scale?: "major" | "minor"; bpm?: number }
  | { type: "ADD_SAMPLES"; samples: SampleItem[] }
  | { type: "REMOVE_SAMPLE"; id: string }
  | { type: "SET_SAMPLE_STATUS"; id: string; status: SampleStatus; error?: string }
  | { type: "SET_SAMPLE_ANALYSIS"; id: string; analysis: SampleAnalysis }
  | { type: "SET_SAMPLE_MODE"; id: string; mode: SampleMode }
  | { type: "SET_SAMPLE_PROCESSED"; id: string; channelData: Float32Array[] }
  | { type: "SET_KOALA_PROJECT"; project: ParsedKoalaProject | null }
  | { type: "SET_TUNING_MODE"; mode: TuningMode }
  | { type: "SET_A4_REFERENCE"; hz: number }
  | { type: "CLEAR_MASTER" }
  | { type: "RESET" };

const DEFAULT_A4_REFERENCE = 440;

function effectiveMasterKey(master: MasterItem): { tonicPitchClass: number; scale: "major" | "minor" } | null {
  const tonicPitchClass = master.overrideTonicPitchClass ?? master.analysis?.tonicPitchClass;
  const scale = master.overrideScale ?? master.analysis?.scale;
  if (tonicPitchClass === undefined || scale === undefined) return null;
  return { tonicPitchClass, scale };
}

/**
 * Semitone correction folded into every sample's shift, on top of landing on
 * the master's tonic pitch class:
 *  - "master": the master loop's own detected detune (in cents), applied
 *    with the same sign, so samples match the loop's actual pitch — not
 *    standard concert pitch. The master's audio is never re-tuned itself.
 *  - "a440": the master's detune is ignored; samples are corrected to the
 *    chosen (editable) A4 reference pitch instead.
 */
function tuningCorrectionSemitones(master: MasterItem, tuningMode: TuningMode, a4Reference: number): number {
  if (tuningMode === "a440") return referenceOffsetSemitones(a4Reference);
  return (master.analysis?.tuningOffsetCents ?? 0) / 100;
}

/**
 * Semitone correction to retune the master loop's own audio onto its
 * detected tonic at the chosen A4 reference. Zero (no-op) in "master" mode,
 * where the master is left pristine by definition.
 */
export function masterCorrectionSemitones(master: MasterItem, tuningMode: TuningMode, a4Reference: number): number {
  if (tuningMode !== "a440") return 0;
  const detuneCents = master.analysis?.tuningOffsetCents ?? 0;
  return -detuneCents / 100 + referenceOffsetSemitones(a4Reference);
}

/** Computes the semitone shift that lands a sample's detected root on the
 * master key's tonic, folding in the active tuning-mode correction. */
function computeShiftSemitones(
  master: MasterItem,
  sample: SampleAnalysis,
  tuningMode: TuningMode,
  a4Reference: number,
): number | undefined {
  const key = effectiveMasterKey(master);
  if (!key) return undefined;
  const targetClass = key.tonicPitchClass;
  const detectedClass = pitchClassOf(sample.detectedMidi);
  const tuningCorrection = tuningCorrectionSemitones(master, tuningMode, a4Reference);
  const baseShift = smallestSignedShift(detectedClass, targetClass);
  const fractionalOffset = Math.round(sample.detectedMidi) - sample.detectedMidi;
  return baseShift + fractionalOffset + tuningCorrection;
}

function withComputedShift(
  master: MasterItem | null,
  sample: SampleItem,
  tuningMode: TuningMode,
  a4Reference: number,
): SampleItem {
  if (!master || !sample.analysis) return sample;
  const pitchShiftSemitones = computeShiftSemitones(master, sample.analysis, tuningMode, a4Reference);
  const timeRatio =
    sample.mode === "loop" && sample.analysis.bpm && master.analysis?.bpm
      ? master.analysis.bpm / sample.analysis.bpm
      : 1;
  return { ...sample, pitchShiftSemitones, timeRatio };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_MASTER":
      return { ...state, master: action.master };
    case "SET_MASTER_ANALYSIS": {
      if (!state.master) return state;
      const master = { ...state.master, analysis: action.analysis, status: "analyzed" as SampleStatus };
      return {
        ...state,
        master,
        samples: state.samples.map((s) => withComputedShift(master, s, state.tuningMode, state.a4Reference)),
      };
    }
    case "SET_MASTER_OVERRIDE": {
      if (!state.master) return state;
      const master = {
        ...state.master,
        overrideTonicPitchClass: action.tonicPitchClass,
        overrideScale: action.scale,
        overrideBpm: action.bpm,
      };
      return {
        ...state,
        master,
        samples: state.samples.map((s) => withComputedShift(master, s, state.tuningMode, state.a4Reference)),
      };
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
          return withComputedShift(
            state.master,
            { ...s, analysis: action.analysis, status: "analyzed", mode },
            state.tuningMode,
            state.a4Reference,
          );
        }),
      };
    case "SET_SAMPLE_MODE":
      return {
        ...state,
        samples: state.samples.map((s) =>
          s.id === action.id
            ? withComputedShift(
                state.master,
                { ...s, mode: action.mode, modeManuallySet: true },
                state.tuningMode,
                state.a4Reference,
              )
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
    case "SET_KOALA_PROJECT":
      return { ...state, koalaProject: action.project };
    case "SET_TUNING_MODE":
      return {
        ...state,
        tuningMode: action.mode,
        samples: state.samples.map((s) => withComputedShift(state.master, s, action.mode, state.a4Reference)),
      };
    case "SET_A4_REFERENCE": {
      const a4Reference = clampA4Reference(action.hz);
      return {
        ...state,
        a4Reference,
        samples: state.samples.map((s) => withComputedShift(state.master, s, state.tuningMode, a4Reference)),
      };
    }
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
      return { master: null, samples: [], koalaProject: null, tuningMode: "master", a4Reference: DEFAULT_A4_REFERENCE };
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
    tuningMode: "master",
    a4Reference: DEFAULT_A4_REFERENCE,
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
