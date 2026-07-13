export interface SampleAnalysis {
  /** Fractional MIDI note of the detected fundamental. */
  detectedMidi: number;
  frequency: number;
  confidence: number;
  /** Detected loop tempo for this sample, if it has clear rhythmic content. */
  bpm: number | null;
  bpmConfidence: number;
}
