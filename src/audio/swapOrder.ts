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

/** How well a sound of category `c` fits a slot of category `slot`: lower is better, -1 is the slot's own type. */
export function rankForSlot(slot: CategoryId | undefined, c: CategoryId | undefined): number {
  const order = (slot && NEAREST[slot]) || [];
  if (slot && c === slot) return -1; // the slot's own type always leads, kit or not
  const at = order.indexOf(c ?? "other");
  return at >= 0 ? at : order.length + categoryIndex(c ?? "other");
}

/** Sorts sounds for a slot of category `slot`: best fit first, ties (same category) by pad position. */
export function sortForSlot<T extends { category?: CategoryId; index: number }>(sounds: T[], slot: CategoryId | undefined): T[] {
  return sounds.slice().sort((a, b) => rankForSlot(slot, a.category) - rankForSlot(slot, b.category) || a.index - b.index);
}

/** A stable pseudo-random number for `key` under `seed` (FNV-1a), so a shuffle holds still while the list re-renders and changes with a new seed. */
function hashed(key: string, seed: number): number {
  let h = 2166136261 ^ Math.floor(seed * 4294967296);
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Shuffles `items` inside each run of neighbours that share a group (`groupOf`), leaving the order of the runs alone: the best fits and the
 * favorites stay first, and the sounds within each tier come up in a fresh order for each `seed`.
 */
export function shuffleWithinRuns<T>(items: T[], keyOf: (item: T) => string, groupOf: (item: T) => string, seed: number): T[] {
  const out: T[] = [];
  for (let start = 0; start < items.length;) {
    const group = groupOf(items[start]);
    let end = start + 1;
    while (end < items.length && groupOf(items[end]) === group) end++;
    out.push(...items.slice(start, end).map((item) => ({ item, h: hashed(keyOf(item), seed) })).sort((a, b) => a.h - b.h).map((e) => e.item));
    start = end;
  }
  return out;
}
