/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { dominantPitch } from "../audio/pitch/yin";
import { frequencyToMidi } from "../audio/theory";
import { classifySample, type CategoryId } from "../audio/classify";

const api = {
  /** Fractional MIDI note of the sample's dominant pitch, or null when it has no clear one (drums, noise). */
  detectMidi(mono: Float32Array, sampleRate: number): number | null {
    const pitch = dominantPitch(mono, sampleRate);
    return pitch ? frequencyToMidi(pitch.frequency) : null;
  },

  /** Pitch plus a best-guess sound category, sharing one pitch-detection pass. */
  analyze(
    mono: Float32Array,
    sampleRate: number,
    fileName: string,
  ): { midi: number | null; category: CategoryId } {
    const midi = api.detectMidi(mono, sampleRate);
    return { midi, category: classifySample(mono, sampleRate, fileName, midi) };
  },
};

export type AnalysisWorkerApi = typeof api;
Comlink.expose(api);
