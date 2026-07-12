/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { detectKey, detectBpm } from "../audio/key/essentiaKey";
import { dominantPitch } from "../audio/pitch/yin";
import { frequencyToMidi, centsOffsetFromNearest } from "../audio/theory";
import type { MasterAnalysis, SampleAnalysis } from "../audio/analysisTypes";

const api = {
  async analyzeMaster(mono: Float32Array, sampleRate: number): Promise<MasterAnalysis> {
    const [key, rhythm, pitch] = await Promise.all([
      detectKey(mono, sampleRate),
      detectBpm(mono, sampleRate),
      Promise.resolve(dominantPitch(mono, sampleRate)),
    ]);

    let tuningOffsetCents = 0;
    let tuningConfidence = 0;
    if (pitch) {
      const midi = frequencyToMidi(pitch.frequency);
      tuningOffsetCents = centsOffsetFromNearest(midi);
      tuningConfidence = pitch.confidence;
    }

    return {
      tonicPitchClass: key.tonicPitchClass,
      tonicName: key.tonicName,
      scale: key.scale,
      keyStrength: key.strength,
      bpm: rhythm.bpm,
      bpmConfidence: rhythm.confidence,
      tuningOffsetCents,
      tuningConfidence,
    };
  },

  async analyzeSample(mono: Float32Array, sampleRate: number): Promise<SampleAnalysis> {
    const pitch = dominantPitch(mono, sampleRate);
    let bpm: number | null = null;
    let bpmConfidence = 0;
    // Always attempted (not just for samples guessed as loops): a sample
    // can be switched to "loop" by the user after analysis, and time-
    // stretching needs bpm to already be there when that happens.
    try {
      const rhythm = await detectBpm(mono, sampleRate);
      bpm = rhythm.bpm;
      bpmConfidence = rhythm.confidence;
    } catch {
      bpm = null;
    }

    if (!pitch) {
      return { detectedMidi: 60, frequency: 261.63, confidence: 0, bpm, bpmConfidence };
    }

    return {
      detectedMidi: frequencyToMidi(pitch.frequency),
      frequency: pitch.frequency,
      confidence: pitch.confidence,
      bpm,
      bpmConfidence,
    };
  },

  /** Re-detects the pitch of already-rendered audio, for the post-process verify pass. */
  async measurePitch(mono: Float32Array, sampleRate: number): Promise<{ midi: number; confidence: number } | null> {
    const pitch = dominantPitch(mono, sampleRate);
    if (!pitch) return null;
    return { midi: frequencyToMidi(pitch.frequency), confidence: pitch.confidence };
  },
};

export type AnalysisWorkerApi = typeof api;
Comlink.expose(api);
