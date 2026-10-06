// How far the acapella has to move to sit in the key picked on the piano, as whole semitones for Koala's pad pitch knob (the audio is never altered).
// Both keys are reduced to their relative minor's tonic, the way a loop is tuned (a major key and its relative minor are one answer), and the move is
// the shortest one: never more than 6 up or down.

/** A key as the song analysis reports it: the tonic (0 = C) and whether it is minor. */
export interface SongKey {
  pc: number;
  minor: boolean;
}

/** Semitones to add to the song's pitch, or 0 when no key was picked or the song's key is unknown. `major` says the key picked on the piano is a major key. */
export function keyOffset(songKey: SongKey | null | undefined, picked: number | null, major: boolean): number {
  if (!songKey || picked === null) return 0;
  const songMinor = songKey.minor ? songKey.pc : (songKey.pc + 9) % 12;
  const target = major ? (picked + 9) % 12 : picked;
  let d = (((target - songMinor) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}
