// Orders the hot-swap list: sounds that fit a slot's category come first, then progressively less likely ones.
import { categoryIndex, type CategoryId } from "./classify";

/** For each kit category, the kit categories from most to least likely to be a good stand-in (itself first). */
const NEAREST: Partial<Record<CategoryId, CategoryId[]>> = {
  kick: ["kick", "perc", "snare", "clap", "closedHat", "openHat", "cymbal", "vox", "fx"],
  snare: ["snare", "clap", "perc", "kick", "closedHat", "openHat", "cymbal", "vox", "fx"],
  clap: ["clap", "snare", "perc", "closedHat", "openHat", "kick", "cymbal", "vox", "fx"],
  closedHat: ["closedHat", "openHat", "cymbal", "perc", "snare", "clap", "kick", "vox", "fx"],
  openHat: ["openHat", "closedHat", "cymbal", "perc", "snare", "clap", "kick", "vox", "fx"],
  cymbal: ["cymbal", "openHat", "closedHat", "fx", "perc", "snare", "clap", "kick", "vox"],
  perc: ["perc", "clap", "snare", "closedHat", "openHat", "kick", "cymbal", "vox", "fx"],
  vox: ["vox", "fx", "perc", "clap", "snare", "kick", "closedHat", "openHat", "cymbal"],
  fx: ["fx", "cymbal", "vox", "openHat", "perc", "clap", "snare", "closedHat", "kick"],
};

/** Sorts sounds for a slot of category `slot`: best fit first, ties (same category) by pad position. */
export function sortForSlot<T extends { category?: CategoryId; index: number }>(sounds: T[], slot: CategoryId | undefined): T[] {
  const order = (slot && NEAREST[slot]) || [];
  const rank = (c: CategoryId | undefined) => {
    if (slot && c === slot) return -1; // the slot's own type always leads, kit or not
    const at = order.indexOf(c ?? "other");
    return at >= 0 ? at : order.length + categoryIndex(c ?? "other");
  };
  return sounds.slice().sort((a, b) => rank(a.category) - rank(b.category) || a.index - b.index);
}
