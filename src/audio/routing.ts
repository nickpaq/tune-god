// Koala's per-pad `bus` field: 0..3 are buses A..D and -1 is the main output (checked against a
// project with pads on A to D and on main). Bus names live in
// the project's mixer.json.
import type { CategoryId } from "./classify";

export const BUS_MAIN = -1;

/** Names written to the four buses' mixer strips (mixer.json `buses[i].name`), matching CATEGORY_BUS. */
export const BUS_NAMES = ["Kick", "Bass", "Drums", "Melodic"];

/** Where each category goes: the kick alone on bus A so the bass can be sidechained from it, bass and 808s apart, the rest of the kit and its loops together, melodic sounds with the vox and FX; unclassified sounds stay on main. */
export const CATEGORY_BUS: Record<CategoryId, number> = {
  kick: 0,
  bass: 1,
  snare: 2,
  clap: 2,
  closedHat: 2,
  openHat: 2,
  cymbal: 2,
  perc: 2,
  drumLoop: 2,
  percLoop: 2,
  melodic: 3,
  melodicLoop: 3,
  vox: 3,
  fx: 3,
  other: BUS_MAIN,
};
