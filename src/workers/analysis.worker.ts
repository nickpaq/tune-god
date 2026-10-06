/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { dominantPitch } from "../audio/pitch/yin";
import { loopKey } from "../audio/pitch/loopKey";
import { bpmFromName, keyFromName } from "../audio/pitch/nameKey";
import { frequencyToMidi } from "../audio/theory";
import { classifySample, extractFeatures, isTunedCategory, type CategoryId } from "../audio/classify";
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
    /** The sound is a melodic loop (a loader said so): its key is read from the notes it holds, not from one pitch. */
    isLoop = false,
  ): { midi: number | null; category: CategoryId; detail: Detail | undefined; centroid: number | undefined; bpm: number | null } {
    const pitch = api.detectMidi(mono, sampleRate);
    const category = classifySample(mono, sampleRate, fileName, pitch);
    // A key written in the file name wins over anything measured. A loop's "pitch" is the tonic of its key (as the relative minor), a whole note; another
    // pitched sound's is its root, and the measured pitch is kept when it already sits on that note (it carries the cents a name cannot).
    const named = keyFromName(fileName);
    const loop = isLoop || category === "melodicLoop";
    let midi: number | null;
    if (named && loop) midi = 48 + named.minorPc;
    else if (named && isTunedCategory(category)) midi = pitch !== null && (((Math.round(pitch) % 12) + 12) % 12) === named.pc ? pitch : 48 + named.pc;
    else midi = loop ? (loopKey(mono, sampleRate)?.midi ?? pitch) : pitch;
    // Spectral centroid feeds the finger-drumming layout (perc order, sort by frequency).
    const features = extractFeatures(mono, sampleRate);
    return { midi, category, detail: classifyDetail(fileName, category), centroid: features?.centroid, bpm: bpmFromName(fileName) };
  },
};

export type AnalysisWorkerApi = typeof api;
Comlink.expose(api);
