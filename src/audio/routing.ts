// Koala's per-pad `bus` field: 0..3 are buses A..D and -1 is the main output (checked against a
// project with pads on A to D and on main). Bus names live in
// the project's mixer.json.
import type { CategoryId } from "./classify";

export const BUS_MAIN = -1;

/** Names written to the four buses' mixer strips (mixer.json `buses[i].name`), matching CATEGORY_BUS. */
/** Product buses 1–4 correspond to Koala's serialized 0–3. */
export const BUS_NAMES = ["Kick + Bass", "Drums", "Melodic", "Loops + Vox + FX"];
export const CATEGORY_BUS: Record<CategoryId, number> = {
  kick: 0, bass: 0, bassLoop: 0,
  snare: 1, clap: 1, closedHat: 1, openHat: 1, cymbal: 1, perc: 1,
  melodic: 2, melodicLoop: 2,
  drumLoop: 3, percLoop: 3, vox: 3, voxLoop: 3, fx: 3, riser: 3, fall: 3, fxLoop: 3,
  other: BUS_MAIN,
};
