// Koala's per-pad `bus` field: 0..3 are buses A..D and -1 is the main output (checked against a
// project with pads on A, B and C and on main; D = 3 follows the same pattern). Bus names live in
// the project's mixer.json.
import type { CategoryId } from "./classify";

export const BUS_MAIN = -1;

/** Names written to the four buses' mixer strips (mixer.json `buses[i].name`), matching CATEGORY_BUS. */
export const BUS_NAMES = ["Drums", "Bass", "Melodic", "Vocals"];

/** Where each category goes: drums together, bass and melodic apart, vox and FX together. */
export const CATEGORY_BUS: Record<CategoryId, number> = {
  kick: 0,
  snare: 0,
  clap: 0,
  closedHat: 0,
  openHat: 0,
  perc: 0,
  bass: 1,
  melodic: 2,
  drumLoop: 0,
  percLoop: 0,
  melodicLoop: 2,
  vox: 3,
  fx: 3,
  other: BUS_MAIN,
};
