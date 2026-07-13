/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { detectBpm } from "../audio/key/essentiaKey";
import { dominantPitch } from "../audio/pitch/yin";
import { frequencyToMidi } from "../audio/theory";
import type { SampleAnalysis } from "../audio/analysisTypes";

export interface MeasuredPitch {
  frequency: number;
  confidence: number;
}

const api = {
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
  async measurePitch(mono: Float32Array, sampleRate: number): Promise<MeasuredPitch | null> {
    const pitch = dominantPitch(mono, sampleRate);
    if (!pitch) return null;
    return { frequency: pitch.frequency, confidence: pitch.confidence };
  },
};

export type AnalysisWorkerApi = typeof api;
Comlink.expose(api);
