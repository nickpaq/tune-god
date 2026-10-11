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

const CLAP = slot("clap");
const CHAT = slot("closedHat");
const CYM = slot("cymbal");
const FX = slot("fx");
const PERC = slot("perc");

// Research: docs/finger-drumming-layouts.md. Kick, snare and both hats on the bottom row is the MPC default, and the only layout: Load Bank A: Drums
// writes it, and nothing rearranges the pads afterwards. A ghost snare or soft kick sits beside (or above) the hit it is a quieter copy of.
export const FINGER_LAYOUTS: FingerLayout[] = [
  {
    id: "horizontal",
    name: "Custom kit (default)",
    description: "Crash, FX and a noise fall on top; percussion and a sweep below; second kick, second snare, rim and clap; first kick, first snare and both hats along the bottom row.",
    slots: [
      CYM, FX, FX, slot("fx", "Noise Fall"),
      PERC, slot("perc", "Perc 2"), PERC, slot("fx", "Sweep"),
      slot("kick", "Kick 2"), slot("snare", "Snare 2"), slot("snare", "Rim"), CLAP,
      slot("kick", "Kick 1"), slot("snare", "Snare 1"), CHAT, slot("openHat", "Open Hat 2"),
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
