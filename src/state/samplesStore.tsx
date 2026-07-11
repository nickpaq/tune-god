import React, { createContext, useContext, useMemo, useReducer } from "react";
import type { MasterAnalysis, SampleAnalysis } from "../audio/analysisTypes";
import { smallestSignedShift, pitchClassOf, semitonesToRatio, targetPitchClassFor } from "../audio/theory";

export type SampleMode = "tune" | "drum";
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
  isLoop: boolean;
  /** Computed once master + analysis are both known. */
  pitchShiftSemitones?: number;
  timeRatio?: number;
  processedChannelData?: Float32Array[];
}

export interface MasterItem {
  file: File;
  name: string;
  sampleRate: number;
  channelData: Float32Array[];
  status: SampleStatus;
  analysis?: MasterAnalysis;
  /** User override in case detection is wrong. */
  overrideTonicPitchClass?: number;
  overrideScale?: "major" | "minor";
}

interface State {
  master: MasterItem | null;
  samples: SampleItem[];
}

type Action =
  | { type: "SET_MASTER"; master: MasterItem }
  | { type: "SET_MASTER_ANALYSIS"; analysis: MasterAnalysis }
  | { type: "SET_MASTER_OVERRIDE"; tonicPitchClass?: number; scale?: "major" | "minor" }
  | { type: "ADD_SAMPLES"; samples: SampleItem[] }
  | { type: "REMOVE_SAMPLE"; id: string }
  | { type: "SET_SAMPLE_STATUS"; id: string; status: SampleStatus; error?: string }
  | { type: "SET_SAMPLE_ANALYSIS"; id: string; analysis: SampleAnalysis }
  | { type: "SET_SAMPLE_MODE"; id: string; mode: SampleMode }
  | { type: "SET_SAMPLE_LOOP"; id: string; isLoop: boolean }
  | { type: "SET_SAMPLE_PROCESSED"; id: string; channelData: Float32Array[] }
  | { type: "RESET" };

function effectiveMasterKey(master: MasterItem): { tonicPitchClass: number; scale: "major" | "minor" } | null {
  const tonicPitchClass = master.overrideTonicPitchClass ?? master.analysis?.tonicPitchClass;
  const scale = master.overrideScale ?? master.analysis?.scale;
  if (tonicPitchClass === undefined || scale === undefined) return null;
  return { tonicPitchClass, scale };
}

/** Computes the semitone shift that lands a sample's detected root on the
 * white-key target pitch class (C for major, A for minor), folding in the
 * master loop's own tuning correction so everything lands on true A440. */
function computeShiftSemitones(master: MasterItem, sample: SampleAnalysis): number | undefined {
  const key = effectiveMasterKey(master);
  if (!key) return undefined;
  const targetClass = targetPitchClassFor(key.scale);
  const detectedClass = pitchClassOf(sample.detectedMidi);
  const tuningCorrection = -(master.analysis?.tuningOffsetCents ?? 0) / 100;
  const baseShift = smallestSignedShift(detectedClass, targetClass);
  const fractionalOffset = Math.round(sample.detectedMidi) - sample.detectedMidi;
  return baseShift + fractionalOffset + tuningCorrection;
}

function withComputedShift(master: MasterItem | null, sample: SampleItem): SampleItem {
  if (!master || !sample.analysis) return sample;
  const pitchShiftSemitones = computeShiftSemitones(master, sample.analysis);
  const timeRatio =
    sample.isLoop && sample.analysis.bpm && master.analysis?.bpm ? master.analysis.bpm / sample.analysis.bpm : 1;
  return { ...sample, pitchShiftSemitones, timeRatio };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_MASTER":
      return { ...state, master: action.master };
    case "SET_MASTER_ANALYSIS": {
      if (!state.master) return state;
      const master = { ...state.master, analysis: action.analysis, status: "analyzed" as SampleStatus };
      return { ...state, master, samples: state.samples.map((s) => withComputedShift(master, s)) };
    }
    case "SET_MASTER_OVERRIDE": {
      if (!state.master) return state;
      const master = {
        ...state.master,
        overrideTonicPitchClass: action.tonicPitchClass,
        overrideScale: action.scale,
      };
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
        samples: state.samples.map((s) =>
          s.id === action.id
            ? withComputedShift(state.master, { ...s, analysis: action.analysis, status: "analyzed" })
            : s,
        ),
      };
    case "SET_SAMPLE_MODE":
      return { ...state, samples: state.samples.map((s) => (s.id === action.id ? { ...s, mode: action.mode } : s)) };
    case "SET_SAMPLE_LOOP":
      return {
        ...state,
        samples: state.samples.map((s) =>
          s.id === action.id ? withComputedShift(state.master, { ...s, isLoop: action.isLoop }) : s,
        ),
      };
    case "SET_SAMPLE_PROCESSED":
      return {
        ...state,
        samples: state.samples.map((s) =>
          s.id === action.id ? { ...s, processedChannelData: action.channelData, status: "done" } : s,
        ),
      };
    case "RESET":
      return { master: null, samples: [] };
    default:
      return state;
  }
}

const StoreContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function SamplesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { master: null, samples: [] });
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSamplesStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useSamplesStore must be used within SamplesProvider");
  return ctx;
}

export function useTargetFrequencyLabel(master: MasterItem | null): string | null {
  return useMemo(() => {
    if (!master) return null;
    const key = effectiveMasterKey(master);
    if (!key) return null;
    const targetClass = targetPitchClassFor(key.scale);
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return names[targetClass];
  }, [master]);
}

export { semitonesToRatio };
