// Fitting a pitch change onto Koala's pitch knob. The knob runs -12 to +12 semitones; a larger change cannot be reproduced at its own octave, only as
// the same pitch class in an octave the knob can reach. The two are kept apart here: the result says which octaves were given up, so nothing claims an
// octave-shifted sound is identical to the one intended.
import { round2 } from "./shift";

export const KNOB_MIN = -12;
export const KNOB_MAX = 12;

export interface KoalaPitch {
  /** The semitones the whole chain asked for (automatic key move + manual tuning), to Koala's two decimals. */
  intended: number;
  /** What goes on the pad's pitch knob: always within -12 to +12. */
  knob: number;
  /** Semitones the knob is short of the intended pitch, a whole number of octaves (0 when the knob reaches it; +12 means it sounds one octave lower than intended). */
  octaveError: number;
  /** True when the knob sounds exactly the intended pitch. When false it is the same pitch class in another octave. */
  exact: boolean;
}

/** Automatic key-based adjustment plus the manual tuning offset (semitones and cents), once: the total pitch change. */
export function totalPitch(auto: number, semis = 0, cents = 0): number {
  return round2(auto + semis + cents / 100);
}

/**
 * The knob value for a total pitch change. Within -12..+12 it is the value itself. Outside, the nearest octave-equivalent value that fits is used
 * (+13 becomes +1, -13 becomes -1 ... +14 becomes +2; -14 becomes -2), the fewest octaves given up. `octaveError` records them.
 */
export function koalaPitch(total: number): KoalaPitch {
  const intended = round2(total);
  if (intended >= KNOB_MIN && intended <= KNOB_MAX) return { intended, knob: intended, octaveError: 0, exact: true };
  const octaves = Math.ceil((Math.abs(intended) - KNOB_MAX) / 12);
  const knob = round2(intended - Math.sign(intended) * octaves * 12);
  return { intended, knob, octaveError: round2(intended - knob), exact: false };
}
