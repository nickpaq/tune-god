// Finger-drumming layouts: each is a 4x4 bank of drum roles, listed top row first (the bottom row
// sits under the thumbs). Only drums live in a layout; bass and melodic sounds go on later banks.
import { ROLE_LABEL, type DrumRole } from "./drumRoles";

export interface LayoutSlot {
  role: DrumRole;
  /** What the preview and any "missing" pad call this slot, e.g. "Low Tom". */
  label: string;
}

export interface FingerLayout {
  id: string;
  name: string;
  description: string;
  /** 16 slots, row-major, top row first. */
  slots: LayoutSlot[];
}

const slot = (role: DrumRole, label = ROLE_LABEL[role]): LayoutSlot => ({ role, label });

const KICK = slot("kick");
const SNARE = slot("snare");
const CLAP = slot("clap");
const RIM = slot("rim");
const CHAT = slot("closedHat");
const OHAT = slot("openHat");
const RIDE = slot("ride");
const CRASH = slot("crash");
const PERC = slot("perc");
const TOM_LOW = slot("tom", "Low Tom");
const TOM_MID = slot("tom", "Mid Tom");
const TOM_HIGH = slot("tom", "High Tom");

/** Flips every row left to right, for the left-handed version of a layout. */
export function mirrorSlots(slots: LayoutSlot[]): LayoutSlot[] {
  return slots.map((_, i) => slots[Math.floor(i / 4) * 4 + (3 - (i % 4))]);
}

const VERTICAL: LayoutSlot[] = [
  CRASH, RIDE, PERC, OHAT,
  TOM_HIGH, TOM_MID, PERC, CHAT,
  TOM_LOW, CLAP, RIM, SNARE,
  PERC, PERC, PERC, KICK,
];

export const FINGER_LAYOUTS: FingerLayout[] = [
  {
    id: "horizontal",
    name: "Horizontal kit",
    description: "Kick, snare and both hats along the bottom row; toms, claps and cymbals above.",
    slots: [
      CRASH, RIDE, PERC, PERC,
      TOM_HIGH, TOM_MID, TOM_LOW, PERC,
      CLAP, RIM, PERC, PERC,
      KICK, SNARE, CHAT, OHAT,
    ],
  },
  {
    id: "vertical",
    name: "Vertical (right hand)",
    description: "Core drums stacked in the right column, leaving the left side for toms and extras.",
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
    description: "Kick pair between two cymbals, snares flanked by side sticks, hats and ride, toms on top.",
    slots: [
      TOM_LOW, TOM_MID, TOM_HIGH, CRASH,
      CHAT, OHAT, CHAT, RIDE,
      RIM, SNARE, SNARE, RIM,
      CRASH, KICK, KICK, CRASH,
    ],
  },
  {
    id: "mirrored",
    name: "Mirrored kit",
    description: "Kicks on the outside and snares above them, hats in the middle, toms and cymbals higher.",
    slots: [
      CRASH, RIDE, PERC, PERC,
      TOM_LOW, TOM_MID, TOM_HIGH, CLAP,
      SNARE, OHAT, OHAT, SNARE,
      KICK, CHAT, CHAT, KICK,
    ],
  },
];

export const DEFAULT_LAYOUT_ID = "horizontal";

export function layoutById(id: string | null | undefined): FingerLayout {
  return FINGER_LAYOUTS.find((l) => l.id === id) ?? FINGER_LAYOUTS[0];
}
