/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { dominantPitch } from "../audio/pitch/yin";
import { frequencyToMidi } from "../audio/theory";
import { classifySample, extractFeatures, type CategoryId } from "../audio/classify";
import { classifyDetail, type Detail } from "../audio/padLabels";
import { analyzeSong, type SongAnalysis } from "../audio/song/beats";

const api = {
  /** Fractional MIDI note of the sample's dominant pitch, or null when it has no clear one (drums, noise). */
  detectMidi(mono: Float32Array, sampleRate: number): number | null {
    const pitch = dominantPitch(mono, sampleRate);
    return pitch ? frequencyToMidi(pitch.frequency) : null;
  },

  /** Tempo, bar 1 and key of a whole song, from its mono mix. */
  analyzeSong(mono: Float32Array, sampleRate: number, beatsPerBar: number): SongAnalysis | null {
    return analyzeSong(mono, sampleRate, beatsPerBar);
  },

  /** Pitch plus a best-guess sound category, sharing one pitch-detection pass. */
  analyze(
    mono: Float32Array,
    sampleRate: number,
    fileName: string,
  ): { midi: number | null; category: CategoryId; detail: Detail | undefined; centroid: number | undefined } {
    const midi = api.detectMidi(mono, sampleRate);
    const category = classifySample(mono, sampleRate, fileName, midi);
    // Spectral centroid feeds the finger-drumming layout (perc order, sort by frequency).
    const features = extractFeatures(mono, sampleRate);
    return { midi, category, detail: classifyDetail(fileName, category), centroid: features?.centroid };
  },
};

export type AnalysisWorkerApi = typeof api;
Comlink.expose(api);
