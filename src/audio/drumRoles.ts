// Finer drum types than the nine colour categories, so a finger-drumming layout can ask for an open
// hat or a crash specifically. A role always belongs to one category; the palette still colours by category.
import type { CategoryId, Features } from "./classify";

export type DrumRole = "kick" | "snare" | "clap" | "rim" | "closedHat" | "openHat" | "ride" | "crash" | "tom" | "perc";

export const ROLE_CATEGORY: Record<DrumRole, CategoryId> = {
  kick: "kick",
  snare: "snare",
  clap: "snare",
  rim: "snare",
  closedHat: "hat",
  openHat: "hat",
  ride: "hat",
  crash: "hat",
  tom: "perc",
  perc: "perc",
};

export const ROLE_LABEL: Record<DrumRole, string> = {
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  rim: "Rim",
  closedHat: "Closed Hat",
  openHat: "Open Hat",
  ride: "Ride",
  crash: "Crash",
  tom: "Tom",
  perc: "Perc",
};

/** The role a drum of this category gets when nothing more specific is known. */
export function defaultRole(category: CategoryId | undefined): DrumRole | undefined {
  switch (category) {
    case "kick":
      return "kick";
    case "snare":
      return "snare";
    case "hat":
      return "closedHat";
    case "perc":
      return "perc";
    default:
      return undefined;
  }
}

/** True for the four categories that count as drums (everything else is melodic or other). */
export function isDrumCategory(category: CategoryId | undefined): boolean {
  return defaultRole(category) !== undefined;
}

/** A stored role only counts while it still agrees with the pad's category (the user can recategorise a pad). */
export function effectiveRole(category: CategoryId | undefined, role: DrumRole | undefined): DrumRole | undefined {
  return role && ROLE_CATEGORY[role] === category ? role : defaultRole(category);
}

function normalize(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-.()[\]]+/g, " ")
    .toLowerCase();
}

/** Decay (seconds to fall 20 dB) at which an unnamed hat counts as open, and as a crash. */
const OPEN_HAT_DECAY = 0.3;
const CRASH_DECAY = 1.0;

/**
 * Role for a drum sample: filename keywords first, then decay time for hats. Returns undefined
 * for non-drum categories.
 */
export function classifyRole(fileName: string, category: CategoryId, features?: Pick<Features, "decay"> | null): DrumRole | undefined {
  const name = normalize(fileName);
  switch (category) {
    case "kick":
      return "kick";
    case "snare":
      if (/\bclap/.test(name)) return "clap";
      if (/\b(rim|rimshot|sidestick|side stick|stick|snap)\b/.test(name)) return "rim";
      return "snare";
    case "hat":
      if (/\bride\b/.test(name)) return "ride";
      if (/\b(crash|cymbal|china|splash)\b/.test(name)) return "crash";
      if (/\b(open ?hat|ohat|oh|open|ohh)\b/.test(name)) return "openHat";
      if (/\b(closed ?hat|chat|chh|ch|closed|pedal|shaker)\b/.test(name)) return "closedHat";
      if (features) {
        if (features.decay >= CRASH_DECAY) return "crash";
        if (features.decay >= OPEN_HAT_DECAY) return "openHat";
      }
      return "closedHat";
    case "perc":
      return /\b(tom|toms|timpani)\b/.test(name) ? "tom" : "perc";
    default:
      return undefined;
  }
}
