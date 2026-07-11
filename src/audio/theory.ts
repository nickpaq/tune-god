// Pitch-class / frequency math shared across key detection, tuning and UI.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type NoteName = (typeof NOTE_NAMES)[number];
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

export function noteNameOf(midi: number): NoteName {
  return NOTE_NAMES[pitchClassOf(midi)];
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
 * White-key target pitch class for a detected key: major keys resolve to C,
 * minor keys resolve to A, so a sample mapped to middle C plays diatonically
 * using only the white keys of the DAW keyboard.
 */
export function targetPitchClassFor(scale: Scale): number {
  return scale === "major" ? pitchClassIndex("C") : pitchClassIndex("A");
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

export function formatNoteWithCents(midi: number): string {
  return `${noteNameOf(midi)}${Math.floor(midi / 12) - 1} ${formatCents(centsOffsetFromNearest(midi))}`;
}
