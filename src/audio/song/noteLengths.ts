/** Durations keep the existing sixteenth-note step unit, including fractional steps. */
export const NOTE_VALUES = [
  { id: "64", label: "1/64", beats: 1 / 16 },
  { id: "32", label: "1/32", beats: 1 / 8 },
  { id: "16", label: "1/16", beats: 1 / 4 },
  { id: "8", label: "1/8", beats: 1 / 2 },
  { id: "4", label: "1/4", beats: 1 },
  { id: "2", label: "1/2", beats: 2 },
  { id: "bar", label: "1 bar", beats: null },
] as const;
export type NoteValue = (typeof NOTE_VALUES)[number]["id"];
/** 48 subdivisions per quarter note represents straight and triplet 64ths exactly. */
export const NOTE_QUANTUM = 1 / 12;
export const SHORTEST_NOTE = 1 / 6;
export const quantizeNote = (steps: number) => Math.round(steps * 12) / 12;
export function noteLength(
  value: NoteValue,
  triplet: boolean,
  beatsPerBar: number,
): number {
  const note = NOTE_VALUES.find((n) => n.id === value)!;
  return quantizeNote((note.beats ?? beatsPerBar) * 4 * (triplet ? 2 / 3 : 1));
}
/** Round absolute endpoints, rather than every duration, to avoid accumulating triplet rounding drift. */
export function noteTicks(start: number, steps: number, ticksPerBeat: number) {
  const at = Math.round((start * ticksPerBeat) / 4);
  return {
    start: at,
    length: Math.round(((start + steps) * ticksPerBeat) / 4) - at,
  };
}
