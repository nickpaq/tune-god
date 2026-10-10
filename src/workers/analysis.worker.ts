/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { dominantPitch } from "../audio/pitch/yin";
import { loopKey } from "../audio/pitch/loopKey";
import { essentiaDominantPitch, essentiaKey, essentiaLoopKey, essentiaTempo } from "../audio/pitch/essentia";
import { bpmFromName, keyFromName } from "../audio/pitch/nameKey";
import { frequencyToMidi } from "../audio/theory";
import { classifySample, extractFeatures, isTunedCategory, type CategoryId } from "../audio/classify";
import { classifyDetail, type Detail } from "../audio/padLabels";
import { analyzeSongKey } from "../audio/song/beats";
import { detectMusicTempo } from "../audio/song/musicTempo";

const api = {
  /** Fractional MIDI note of the sample's dominant pitch, or null when it has no clear one (drums, noise). */
  async detectMidi(mono: Float32Array, sampleRate: number): Promise<number | null> {
    try {
      const pitch = await essentiaDominantPitch(mono, sampleRate);
      return pitch ? frequencyToMidi(pitch.frequency) : null;
    } catch {
      // Keep imported-sample analysis available if a browser cannot initialize WASM.
      const fallback = dominantPitch(mono, sampleRate);
      return fallback ? frequencyToMidi(fallback.frequency) : null;
    }
  },

  async analyzeSongKey(mono: Float32Array, sampleRate: number) {
    try {
      const key = await essentiaKey(mono, sampleRate);
      if (key) return { pc: key.pc, minor: key.minor, confidence: key.confidence };
    } catch { /* fall back to the existing chroma/profile estimator */ }
    return analyzeSongKey(mono, sampleRate);
  },
  async detectMusicTempo(mono: Float32Array): Promise<{ bpm: number; downbeatSeconds: number }> {
    try {
      return await essentiaTempo(mono);
    } catch {
      return detectMusicTempo(mono);
    }
  },

  /** Pitch plus a best-guess sound category, sharing one pitch-detection pass. */
  async analyze(
    mono: Float32Array,
    sampleRate: number,
    fileName: string,
    /** The sound is a melodic loop (a loader said so): its key is read from the notes it holds, not from one pitch. */
    isLoop = false,
  ): Promise<{ midi: number | null; category: CategoryId; detail: Detail | undefined; centroid: number | undefined; bpm: number | null; /** The key came from the file name. */ named: boolean }> {
    let pitch = await api.detectMidi(mono, sampleRate);
    const category = classifySample(mono, sampleRate, fileName, pitch);
    // An 808 or bass glides down from its attack to the note it settles on, so its pitch is read from the second half of the sound only.
    // A key written in the file name wins over anything measured. A loop's "pitch" is the tonic of its key (as the relative minor), a whole note; another
    // pitched sound's is its root, and the measured pitch is kept when it already sits on that note (it carries the cents a name cannot).
    const named = keyFromName(fileName);
    const loop = isLoop || category === "melodicLoop";
    let midi: number | null;
    let fromName = false;
    if (named && loop) {
      midi = 48 + named.minorPc;
      fromName = true;
    } else if (named && isTunedCategory(category)) {
      midi = pitch !== null && (((Math.round(pitch) % 12) + 12) % 12) === named.pc ? pitch : 48 + named.pc;
      fromName = true;
    } else if (loop) {
      try {
        midi = (await essentiaLoopKey(mono, sampleRate))?.midi ?? pitch;
      } catch {
        midi = loopKey(mono, sampleRate)?.midi ?? pitch;
      }
    } else midi = pitch;
    // Spectral centroid feeds the finger-drumming layout (perc order, sort by frequency).
    const features = extractFeatures(mono, sampleRate);
    let bpm = bpmFromName(fileName);
    if (bpm === null && loop && mono.length >= sampleRate * 2) {
      try { bpm = (await essentiaTempo(mono, sampleRate)).bpm; } catch { /* tempo is an optional loop hint */ }
    }
    return { midi, category, detail: classifyDetail(fileName, category), centroid: features?.centroid, bpm, named: fromName };
  },
};

export type AnalysisWorkerApi = typeof api;
Comlink.expose(api);
