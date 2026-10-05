// The drums a finger-drumming layout had no slot for: real kit sounds sitting past bank A.
import type { Pad } from "../components/PadPanel";
import { isKitCategory } from "./classify";
import { EMPTY_PAD_LABEL } from "./fingerDrumming";
import { makePlaceholderPad } from "./placeholderPads";
import { PADS_PER_BANK, inChopBank } from "./padMoves";

/** What to do with them at export: keep them (backfilled on the last page) or delete them. */
export type ExtraDrums = "keep" | "delete";

const isExtraDrum = (p: Pad) => !p.placeholder && !p.ghost && isKitCategory(p.category) && p.index >= PADS_PER_BANK && !inChopBank(p.index);

export const extraDrumCount = (pads: Record<number, Pad>): number => Object.values(pads).filter(isExtraDrum).length;

/** `pads` without the extra drums; each one's slot becomes an "Empty pad". */
export function withoutExtraDrums(pads: Record<number, Pad>): Record<number, Pad> {
  const next = { ...pads };
  for (const p of Object.values(pads)) {
    if (isExtraDrum(p)) next[p.index] = makePlaceholderPad({ index: p.index, kind: "empty", label: EMPTY_PAD_LABEL });
  }
  return next;
}

/** A sound dropped into a ghost slot: it replaces the ghost copy, and its old slot becomes an "Empty pad". */
export function fillGhostSlot(pads: Record<number, Pad>, slot: number, from: number): Record<number, Pad> {
  const sound = pads[from];
  if (!sound || !pads[slot]?.ghost || slot === from) return pads;
  const next = { ...pads };
  next[slot] = { ...sound, index: slot };
  next[from] = makePlaceholderPad({ index: from, kind: "empty", label: EMPTY_PAD_LABEL });
  return next;
}
