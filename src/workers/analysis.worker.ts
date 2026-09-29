/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { dominantPitch } from "../audio/pitch/yin";
import { frequencyToMidi } from "../audio/theory";

const api = {
  /** Fractional MIDI note of the sample's dominant pitch, or null when it has no clear one (drums, noise). */
  detectMidi(mono: Float32Array, sampleRate: number): number | null {
    const pitch = dominantPitch(mono, sampleRate);
    return pitch ? frequencyToMidi(pitch.frequency) : null;
  },
};

export type AnalysisWorkerApi = typeof api;
Comlink.expose(api);
