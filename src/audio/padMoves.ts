// Pure helpers for rearranging pads across the 4 banks x 16 slots grid. A pad carries all of its
// data (colour category, tuning, trims) with it, so moving or swapping only changes `index`.
import type { Pad } from "../components/PadPanel";

export const PAD_COUNT = 64;
export const PADS_PER_BANK = 16;
/**
 * Bank D (pads 48 to 63) belongs to the chopped song's sections and nothing else. No tool (drum layouts, Organize, packs, extra drums, the
 * misfit swap, "next empty pad") puts anything there, placeholders included, or moves anything in or out of it: tools work on banks A to C only.
 */
export const CHOP_BANK_START = 48;
export const TOOL_PAD_COUNT = CHOP_BANK_START;
export const inChopBank = (index: number): boolean => index >= CHOP_BANK_START && index < PAD_COUNT;

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

/** First empty pad at or after the start of `bank`, wrapping past bank C (never into bank D, the chops' bank); null when banks A to C are full. */
export function nextEmptyPad(pads: Record<number, Pad>, bank: number): number | null {
  for (let i = 0; i < TOOL_PAD_COUNT; i++) {
    const index = (Math.min(bank, 2) * PADS_PER_BANK + i) % TOOL_PAD_COUNT;
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
