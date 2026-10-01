// Pure helpers for rearranging pads across the 4 banks x 16 slots grid. A pad carries all of its
// data (colour category, tuning, trims) with it, so moving or swapping only changes `index`.
import type { Pad } from "../components/PadPanel";
import type { CategoryId } from "./classify";
import { makePlaceholderPad } from "./placeholderPads";

export const PAD_COUNT = 64;
export const PADS_PER_BANK = 16;

/** Moves the pad at `from` to `to`; if `to` is occupied the two swap. */
export function movePad(pads: Record<number, Pad>, from: number, to: number): Record<number, Pad> {
  const a = pads[from];
  if (!a || from === to || to < 0 || to >= PAD_COUNT) return pads;
  const b = pads[to];
  const next = { ...pads };
  delete next[from];
  next[to] = { ...a, index: to };
  if (b) next[from] = { ...b, index: from };
  return next;
}

export function removePad(pads: Record<number, Pad>, index: number): Record<number, Pad> {
  if (!pads[index]) return pads;
  const next = { ...pads };
  delete next[index];
  return next;
}

/** First empty pad at or after the start of `bank`, wrapping past the last bank; null when the grid is full. */
export function nextEmptyPad(pads: Record<number, Pad>, bank: number): number | null {
  for (let i = 0; i < PAD_COUNT; i++) {
    const index = (bank * PADS_PER_BANK + i) % PAD_COUNT;
    if (!pads[index]) return index;
  }
  return null;
}

/** First empty pad inside `bank` only, or null when that bank is full. */
export function emptyPadInBank(pads: Record<number, Pad>, bank: number): number | null {
  for (let i = 0; i < PADS_PER_BANK; i++) {
    const index = bank * PADS_PER_BANK + i;
    if (!pads[index]) return index;
  }
  return null;
}

/**
 * After the sound at `index` (on a finger-drumming page) has been re-typed so it no longer fits its slot, puts a
 * sound of the slot's category there instead. The replacement comes from a later bank (swapping places with the
 * misfit); with none available the misfit moves to the first free later pad and the slot becomes a "missing" gap.
 */
export function replaceMisfit(pads: Record<number, Pad>, index: number, slotCategory: CategoryId, slotLabel: string): Record<number, Pad> {
  const isSound = (p: Pad) => !p.placeholder && !p.ghost;
  const replacement = Object.values(pads)
    .filter((p) => isSound(p) && p.index >= PADS_PER_BANK && p.category === slotCategory)
    .sort((a, b) => a.index - b.index)[0];
  if (replacement) return movePad(pads, index, replacement.index);
  const free = nextEmptyPad(pads, 1);
  if (free === null || free < PADS_PER_BANK) return pads;
  const next = movePad(pads, index, free);
  next[index] = makePlaceholderPad({ index, kind: "missing", label: slotLabel });
  return next;
}
