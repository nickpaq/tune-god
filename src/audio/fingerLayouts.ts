// Finger-drumming layouts: each is a 4x4 bank of drum categories, listed top row first (the bottom row
// sits under the thumbs). Only drums live in a layout; bass and melodic sounds go on later banks.
import { categoryLabel, type CategoryId } from "./classify";

export interface LayoutSlot {
  /** The drum category this slot wants. */
  category: CategoryId;
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

const slot = (category: CategoryId, label = categoryLabel(category)): LayoutSlot => ({ category, label });

const CLAP = slot("clap");
const CHAT = slot("closedHat");
const CYM = slot("cymbal");
const FX = slot("fx");
const PERC = slot("perc");

// Research: docs/finger-drumming-layouts.md. Kick, snare and both hats on the bottom row is the MPC default, and the only layout: Load Bank A: Drums
// writes it, and nothing rearranges the pads afterwards.
export const FINGER_LAYOUTS: FingerLayout[] = [
  {
    id: "horizontal",
    name: "MPC kit",
    description: "Cymbal and FX on top; percussion and FX below; second kick, second snare, third snare and clap; first kick, first snare and both hats along the bottom row.",
    slots: [
      CYM, FX, FX, FX,
      PERC, slot("perc", "Perc 2"), PERC, FX,
      slot("kick", "Kick 2"), slot("snare", "Snare 2"), slot("snare", "Snare 3"), CLAP,
      slot("kick", "Kick 1"), slot("snare", "Snare 1"), CHAT, slot("openHat", "Open Hat 2"),
    ],
  },
];

export const DEFAULT_LAYOUT_ID = "horizontal";

export function layoutById(id: string | null | undefined): FingerLayout {
  return FINGER_LAYOUTS.find((l) => l.id === id) ?? FINGER_LAYOUTS[0];
}
