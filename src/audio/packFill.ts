// Adding a second sample pack to a project that already has one: which pad slots are still missing a sound, what kinds of
// sound they want, and which new sound goes in which slot. Nothing the user already has is moved or replaced.
import { isKitCategory, type CategoryId } from "./classify";
import { SUBSTITUTE_GROUP } from "./fingerDrumming";
import type { FingerLayout } from "./fingerLayouts";
import { BANK_B_QUOTA, type PlanKey } from "./samplePack";

/** The part of a pad that matters here. */
export interface FillPad {
  index: number;
  category?: CategoryId;
  is808?: boolean;
  placeholder?: unknown;
  ghost?: unknown;
}

/** What a pad slot is for, in a sample pack's layout: a kit slot, a bank B pad, a bass or 808 pad, or the rest of bank C. Bank D is the user's. */
export type Zone = { kind: "kit"; category: CategoryId } | { kind: "melodicLoop" } | { kind: "melodic" } | { kind: "bass" } | { kind: "808" } | { kind: "rest" };

const BANK = 16;
const LOOP_PADS = BANK_B_QUOTA.melodicLoop ?? 8;

export function zoneOf(index: number, layout: FingerLayout): Zone | null {
  if (index < BANK) {
    const slot = layout.slots[index];
    // A ghost slot is made from the kit's own snare or kick on export, so it is never filled from a pack.
    return slot && !slot.ghostOf ? { kind: "kit", category: slot.category } : null;
  }
  if (index < BANK + LOOP_PADS) return { kind: "melodicLoop" };
  if (index < BANK * 2) return { kind: "melodic" };
  if (index < BANK * 2 + 2) return { kind: "bass" };
  if (index < BANK * 2 + 4) return { kind: "808" };
  if (index < BANK * 3) return { kind: "rest" };
  return null;
}

/** Slots in banks A to C that hold no sound: nothing at all, or a silent placeholder. */
export function missingSlots(pads: Record<number, FillPad | undefined>, layout: FingerLayout): number[] {
  const out: number[] = [];
  for (let i = 0; i < BANK * 3; i++) {
    if (!zoneOf(i, layout)) continue;
    const pad = pads[i];
    if (!pad || pad.placeholder) out.push(i);
  }
  return out;
}

export interface FillPlan {
  /** Arguments for planPackSounds, so it picks only what the gaps need (and tops up the hot-swap pool). */
  kitSlots: Partial<Record<CategoryId, number>>;
  bankB: Partial<Record<CategoryId, number>>;
  bassPads: number;
  pads808: number;
  restPads: number;
  have: Partial<Record<PlanKey, number>>;
}

/** How many sounds of each kind the gaps want, and how many spares of each kind the pool already holds. */
export function fillPlan(missing: number[], layout: FingerLayout, spares: FillPad[]): FillPlan {
  const kitSlots: FillPlan["kitSlots"] = {};
  // Every drum type of the layout is listed (with 0 when no slot is missing) so that its spares get topped up too.
  for (const slot of layout.slots) if (!slot.ghostOf) kitSlots[slot.category] = 0;
  const plan: FillPlan = { kitSlots, bankB: { melodicLoop: 0, melodic: 0 }, bassPads: 0, pads808: 0, restPads: 0, have: {} };
  for (const i of missing) {
    const zone = zoneOf(i, layout);
    if (!zone) continue;
    if (zone.kind === "kit") kitSlots[zone.category] = (kitSlots[zone.category] ?? 0) + 1;
    else if (zone.kind === "melodicLoop" || zone.kind === "melodic") plan.bankB[zone.kind] = (plan.bankB[zone.kind] ?? 0) + 1;
    else if (zone.kind === "bass") plan.bassPads++;
    else if (zone.kind === "808") plan.pads808++;
    else plan.restPads++;
  }
  for (const p of spares) {
    const key: PlanKey = p.category === "bass" && p.is808 ? "808" : (p.category ?? "other");
    plan.have[key] = (plan.have[key] ?? 0) + 1;
  }
  return plan;
}

export interface FillSound {
  category: CategoryId;
  is808?: boolean;
}

/**
 * Which new sound goes into which missing slot (slot -> index into `sounds`). A slot takes a sound of its own kind; a bass
 * slot with no ordinary bass takes an 808 and the other way round; the rest of bank C takes any type that has no place of
 * its own. Slots with no sound for them are left as they were.
 */
export function assignFill(missing: number[], layout: FingerLayout, sounds: FillSound[]): Map<number, number> {
  const taken = new Set<number>();
  const out = new Map<number, number>();
  const take = (ok: (s: FillSound) => boolean) => {
    const at = sounds.findIndex((s, n) => !taken.has(n) && ok(s));
    if (at >= 0) taken.add(at);
    return at;
  };
  const hasOwnPlace = (s: FillSound) => isKitCategory(s.category) || s.category === "melodic" || s.category === "melodicLoop" || s.category === "bass";
  for (const i of missing) {
    const zone = zoneOf(i, layout);
    if (!zone) continue;
    let at = -1;
    if (zone.kind === "kit") at = take((s) => s.category === zone.category);
    else if (zone.kind === "melodicLoop" || zone.kind === "melodic") at = take((s) => s.category === zone.kind);
    else if (zone.kind === "bass") at = take((s) => s.category === "bass" && !s.is808);
    else if (zone.kind === "808") at = take((s) => s.category === "bass" && !!s.is808);
    else at = take((s) => !hasOwnPlace(s));
    // A kit slot with no sound of its type takes one of the same family (any hat for a hat slot, a clap for a snare).
    if (at < 0 && zone.kind === "kit") at = take((s) => SUBSTITUTE_GROUP[s.category] !== undefined && SUBSTITUTE_GROUP[s.category] === SUBSTITUTE_GROUP[zone.category]);
    if (at < 0 && (zone.kind === "bass" || zone.kind === "808")) at = take((s) => s.category === "bass");
    if (at >= 0) out.set(i, at);
  }
  return out;
}
