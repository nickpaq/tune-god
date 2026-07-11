import type { Scale } from "./theory";

export interface MasterAnalysis {
  tonicPitchClass: number;
  tonicName: string;
  scale: Scale;
  keyStrength: number;
  bpm: number;
  bpmConfidence: number;
  /** Cents offset of the loop's own tuning from equal temperament @ A440. */
  tuningOffsetCents: number;
  tuningConfidence: number;
}

export interface SampleAnalysis {
  /** Fractional MIDI note of the detected fundamental. */
  detectedMidi: number;
  frequency: number;
  confidence: number;
  /** Detected loop tempo for this sample, if it has clear rhythmic content. */
  bpm: number | null;
  bpmConfidence: number;
}
