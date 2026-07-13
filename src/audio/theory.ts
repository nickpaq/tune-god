// Pitch-class / frequency math shared across key detection, tuning and UI.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type Scale = "major" | "minor";

/** Frequency of a MIDI note number at a given A4 reference (default 440). */
export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Fractional MIDI note number for a frequency at a given A4 reference. */
export function frequencyToMidi(frequency: number, a4 = 440): number {
  return 69 + 12 * Math.log2(frequency / a4);
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

/** Signed whole semitones for a slider's floating value bubble, e.g. 3 -> "+3", -2 -> "-2", 0 -> "0". */
export function formatSignedSemitones(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v)}`;
}

/** Signed whole cents for a slider's floating value bubble, e.g. 15 -> "+15c", -30 -> "-30c", 0 -> "0c". */
export function formatSignedCents(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v)}c`;
}
