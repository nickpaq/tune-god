// Pitch-class / frequency math shared across key detection, tuning and UI.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type Scale = "major" | "minor";

export interface DetectedPitch {
  /** MIDI note number, fractional (e.g. 60.34 = 34 cents sharp of middle C) */
  midi: number;
  frequency: number;
}

/** Frequency of a MIDI note number at a given A4 reference (default 440). */
export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Fractional MIDI note number for a frequency at a given A4 reference. */
export function frequencyToMidi(frequency: number, a4 = 440): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

/** Converts a semitone shift ratio for pitch-shifting APIs (e.g. Rubber Band's pitch scale). */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/**
 * Accepted range for an editable A4 reference pitch: 415 Hz (Baroque/A415
 * pitch) to 466 Hz (historical "high pitch"/Chorton), the conventional
 * bounds used by tuner/DAW reference-pitch controls.
 */
export const A4_REFERENCE_RANGE = { min: 415, max: 466 } as const;

export function clampA4Reference(hz: number): number {
  return Math.min(A4_REFERENCE_RANGE.max, Math.max(A4_REFERENCE_RANGE.min, hz));
}

/** Semitone correction that retunes from true A440 to an alternate A4 reference. */
export function referenceOffsetSemitones(a4Reference: number): number {
  return 12 * Math.log2(a4Reference / 440);
}

/** A pad's manual trim as one number of cents: its semitone and cent trims together. */
export function trimCents(semis: number, cents: number): number {
  return semis * 100 + cents;
}

/** Splits a trim in cents back into the pad's whole semitones and the cents left over (both carry the trim's sign). */
export function splitTrim(totalCents: number): { semis: number; cents: number } {
  const semis = Math.trunc(totalCents / 100);
  return { semis, cents: totalCents - semis * 100 };
}

/** A trim in cents as signed semitones with three decimals for the slider, e.g. 137 -> "+1.370", -50 -> "-0.500", 0 -> "0.000". */
export function formatTrim(totalCents: number): string {
  return `${Math.abs(totalCents) >= 0.05 ? (totalCents > 0 ? "+" : "-") : ""}${(Math.abs(totalCents) / 100).toFixed(3)}`;
}

/**
 * Whole octaves (in semitones, never negative) that lift a bass preview up next to the matching tone, which sits in the
 * octave from middle C. Only ever added to the voice that is playing: it is never part of a pad's shift or trim, so
 * nothing saved or exported carries it.
 */
export function bassLiftSemitones(soundsAtMidi: number, tonePitchClass: number): number {
  return 12 * Math.max(0, Math.round((60 + tonePitchClass - soundsAtMidi) / 12));
}
