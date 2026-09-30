// Koala's per-pad `bus` field: 0..3 are buses A..D and -1 is the main output (checked against a
// project with pads on A, B and C and on main; D = 3 follows the same pattern).
import type { CategoryId } from "./classify";

export const BUS_MAIN = -1;

export const BUSES = [
  { value: 0, label: "Bus A" },
  { value: 1, label: "Bus B" },
  { value: 2, label: "Bus C" },
  { value: 3, label: "Bus D" },
];

/** Where each category goes: drums together, bass and melodic apart, vocals and FX together. */
export const CATEGORY_BUS: Record<CategoryId, number> = {
  kick: 0,
  snare: 0,
  hat: 0,
  perc: 0,
  bass: 1,
  melodic: 2,
  vocal: 3,
  fx: 3,
  other: BUS_MAIN,
};
