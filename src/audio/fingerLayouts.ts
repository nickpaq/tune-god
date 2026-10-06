// Finger-drumming layouts: each is a 4x4 bank of drum categories, listed top row first (the bottom row
// sits under the thumbs). Only drums live in a layout; bass and melodic sounds go on later banks.
import { categoryLabel, type CategoryId } from "./classify";

export interface LayoutSlot {
  /** The drum category this slot wants. */
  category: CategoryId;
  /** Set on a ghost snare or soft kick slot: the category of the real sound this slot holds a quieter copy of. */
  ghostOf?: "snare" | "kick";
  /** What the preview and any "missing" pad call this slot, e.g. "Perc". */
  label: string;
}

export interface FingerLayout {
  id: string;
  name: string;
  description: string;
  /** 16 slots, row-major, top row first. */
  slots: LayoutSlot[];
}

const slot = (category: CategoryId, label = categoryLabel(category), ghostOf?: "snare" | "kick"): LayoutSlot => ({ category, label, ghostOf });

const KICK = slot("kick");
const SNARE = slot("snare");
const GHOST = slot("snare", "Ghost Snare", "snare");
const SOFT = slot("kick", "Soft Kick", "kick");
const CLAP = slot("clap");
const CHAT = slot("closedHat");
const OHAT = slot("openHat");
const CYM = slot("cymbal");
const FX = slot("fx");
const VOX = slot("vox");
const PERC = slot("perc");

// Research: docs/finger-drumming-layouts.md. Kick, snare and both hats on the bottom row is the MPC default, and the only layout: Load Bank A: Drums
// writes it, and nothing rearranges the pads afterwards. A ghost snare or soft kick sits beside (or above) the hit it is a quieter copy of.
export const FINGER_LAYOUTS: FingerLayout[] = [
  {
    id: "horizontal",
    name: "Horizontal kit (MPC default)",
    description: "Kick, snare and both hats along the bottom row; soft kick and ghost snare above them, then percussion, cymbals, vox and FX.",
    slots: [
      CYM, CYM, FX, VOX,
      PERC, PERC, PERC, PERC,
      SOFT, GHOST, CLAP, FX,
      KICK, SNARE, CHAT, OHAT,
    ],
  },
];

/** How many real sounds a layout wants of each type: its slots, leaving out ghost slots (those are made from a snare or kick at export). */
export function kitSlotCounts(layout: FingerLayout): Partial<Record<CategoryId, number>> {
  const counts: Partial<Record<CategoryId, number>> = {};
  for (const s of layout.slots) if (!s.ghostOf) counts[s.category] = (counts[s.category] ?? 0) + 1;
  return counts;
}

export const DEFAULT_LAYOUT_ID = "horizontal";

export function layoutById(id: string | null | undefined): FingerLayout {
  return FINGER_LAYOUTS.find((l) => l.id === id) ?? FINGER_LAYOUTS[0];
}
