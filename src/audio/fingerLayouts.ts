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

const KICK = slot("kick");
const SNARE = slot("snare");
const CLAP = slot("clap");
const CHAT = slot("closedHat");
const OHAT = slot("openHat");
const CYM = slot("cymbal");
const FX = slot("fx");
const VOX = slot("vox");
const PERC = slot("perc");

/** Flips every row left to right, for the left-handed version of a layout. */
export function mirrorSlots(slots: LayoutSlot[]): LayoutSlot[] {
  return slots.map((_, i) => slots[Math.floor(i / 4) * 4 + (3 - (i % 4))]);
}

const VERTICAL: LayoutSlot[] = [
  CYM, FX, VOX, OHAT,
  PERC, PERC, PERC, CHAT,
  PERC, PERC, CLAP, SNARE,
  PERC, PERC, PERC, KICK,
];

export const FINGER_LAYOUTS: FingerLayout[] = [
  {
    id: "horizontal",
    name: "Horizontal kit",
    description: "Kick, snare and both hats along the bottom row; percussion, claps, cymbals, vox and FX above.",
    slots: [
      CYM, CYM, FX, VOX,
      PERC, PERC, PERC, PERC,
      CLAP, PERC, PERC, FX,
      KICK, SNARE, CHAT, OHAT,
    ],
  },
  {
    id: "vertical",
    name: "Vertical (right hand)",
    description: "Core drums stacked in the right column, leaving the left side for percussion, cymbal, vox and FX.",
    slots: VERTICAL,
  },
  {
    id: "vertical-left",
    name: "Vertical (left hand)",
    description: "The vertical layout mirrored, with the core drums in the left column.",
    slots: mirrorSlots(VERTICAL),
  },
  {
    id: "quest-for-groove",
    name: "Quest for Groove 4x4",
    description: "Kick pair between two cymbals, snares flanked by claps, hats and a cymbal, percussion and FX on top.",
    slots: [
      PERC, PERC, PERC, FX,
      CHAT, OHAT, CHAT, CYM,
      CLAP, SNARE, SNARE, CLAP,
      CYM, KICK, KICK, CYM,
    ],
  },
  {
    id: "mirrored",
    name: "Mirrored kit",
    description: "Kicks on the outside and snares above them, hats in the middle, percussion, cymbal, vox and FX higher.",
    slots: [
      CYM, FX, VOX, PERC,
      PERC, PERC, PERC, CLAP,
      SNARE, OHAT, OHAT, SNARE,
      KICK, CHAT, CHAT, KICK,
    ],
  },
];

export const DEFAULT_LAYOUT_ID = "horizontal";

export function layoutById(id: string | null | undefined): FingerLayout {
  return FINGER_LAYOUTS.find((l) => l.id === id) ?? FINGER_LAYOUTS[0];
}

/** The layout slot a pad sits in, for pads on the drum banks (A and B); undefined elsewhere. */
export function layoutSlotAt(layout: FingerLayout, padIndex: number): LayoutSlot | undefined {
  return padIndex >= 0 && padIndex < 32 ? layout.slots[padIndex % 16] : undefined;
}
