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

/**
 * White-key target pitch class: the pitch class a sample's root must be tuned
 * to so that, once mapped to middle C in a DAW, the white keys play the
 * detected key. The white keys form a major scale from C (equivalently, its
 * relative minor from A), so:
 *   - major key: tune to the tonic itself (C key plays the root).
 *   - minor key: tune to the relative major root (tonic + 3 semitones), which
 *     lands the minor tonic on the A key — e.g. F minor tunes samples to G#/Ab
 *     so pressing A plays F and the white keys play the F minor scale.
 */
export function targetPitchClassFor(scale: Scale, tonicPitchClass: number): number {
  return scale === "major" ? tonicPitchClass : (tonicPitchClass + 3) % 12;
}

/** Converts a semitone shift ratio for pitch-shifting APIs (e.g. Rubber Band's pitch scale). */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return "in tune";
  return rounded > 0 ? `+${rounded}c` : `${rounded}c`;
}
