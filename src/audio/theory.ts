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

/** Cents offset of a fractional MIDI value from its nearest integer semitone. */
export function centsOffsetFromNearest(midi: number): number {
  const nearest = Math.round(midi);
  return (midi - nearest) * 100;
}

export function pitchClassOf(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function pitchClassIndex(name: string): number {
  const normalized = name.trim().toUpperCase().replace("♯", "#").replace("♭", "b");
  const flatToSharp: Record<string, string> = {
    DB: "C#",
    EB: "D#",
    GB: "F#",
    AB: "G#",
    BB: "A#",
  };
  const sharp = flatToSharp[normalized] ?? normalized;
  const idx = NOTE_NAMES.findIndex((n) => n.toUpperCase() === sharp);
  if (idx === -1) throw new Error(`Unrecognized note name: ${name}`);
  return idx;
}

/**
 * Smallest signed semitone shift (in [-6, 6]) that moves `fromPitchClass`
 * onto `toPitchClass`, wrapping through the nearest octave direction.
 */
export function smallestSignedShift(fromPitchClass: number, toPitchClass: number): number {
  let diff = (toPitchClass - fromPitchClass) % 12;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
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

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return "in tune";
  return rounded > 0 ? `+${rounded}c` : `${rounded}c`;
}
