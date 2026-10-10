// Choosing the pads a chop is written to. Any of the 64 pads may be a destination, empty or not; a locked pad never is. Pure helpers: the picker screen
// (PadAllocator.tsx) only draws what these work out, and the export gets the ordered list.
import type { Pad } from "../components/PadPanel";
import { PADS_PER_BANK, PAD_COUNT } from "./padMoves";

export const BANK_LETTERS = ["A", "B", "C", "D"] as const;

/** "A1" to "D16". */
export const padName = (index: number): string => `${BANK_LETTERS[Math.floor(index / PADS_PER_BANK)]}${(index % PADS_PER_BANK) + 1}`;

export interface DestinationPad {
  index: number;
  /** A sample is on the pad (an "Empty pad" placeholder is not one). */
  occupied: boolean;
  locked: boolean;
  /** The name of the sound there, for the overwrite warning. */
  name?: string;
}

/** The state of all 64 pads of the project as destinations. */
export function destinationPads(pads: Record<number, Pad>, nameOf: (pad: Pad) => string): DestinationPad[] {
  return Array.from({ length: PAD_COUNT }, (_, index) => {
    const pad = pads[index];
    const occupied = !!pad && pad.placeholder?.kind !== "empty";
    return { index, occupied, locked: !!pad?.locked, name: occupied ? nameOf(pad) : undefined };
  });
}

export type Selection = ReadonlySet<number>;

/** Taps a pad: selected becomes unselected and the other way round. A locked pad never changes. */
export function toggle(selection: Selection, pad: DestinationPad): Set<number> {
  const next = new Set(selection);
  if (pad.locked) return next;
  if (next.has(pad.index)) next.delete(pad.index);
  else next.add(pad.index);
  return next;
}

/** Whether a tap selects an occupied pad that was not selected: the one transition that plays the pad's sample. */
export const tapPreviews = (selection: Selection, pad: DestinationPad): boolean => pad.occupied && !pad.locked && !selection.has(pad.index);

/** Only the empty pads, whatever was selected before. */
export const selectUnused = (pads: readonly DestinationPad[]): Set<number> => new Set(pads.filter((p) => !p.occupied && !p.locked).map((p) => p.index));

/** Every pad that can be written to, occupied or not. */
export const selectAll = (pads: readonly DestinationPad[]): Set<number> => new Set(pads.filter((p) => !p.locked).map((p) => p.index));

export interface SelectionSummary {
  selected: number;
  /** Pads in the project (64). */
  total: number;
  empty: number;
  overwrite: number;
}

export function summarize(pads: readonly DestinationPad[], selection: Selection): SelectionSummary {
  let empty = 0;
  let overwrite = 0;
  for (const p of pads) {
    if (!selection.has(p.index) || p.locked) continue;
    if (p.occupied) overwrite++;
    else empty++;
  }
  return { selected: empty + overwrite, total: pads.length, empty, overwrite };
}

/** The destinations in assignment order: Bank A to D, ascending pad number (the pad index runs that way). Pads that are not selected are skipped. */
export const orderedDestinations = (pads: readonly DestinationPad[], selection: Selection): number[] =>
  pads.filter((p) => selection.has(p.index) && !p.locked).map((p) => p.index);

export interface ChopLimit {
  /** The most chops that can be written: the destinations, the chops marked and (when each chop needs a pattern of its own) Koala's free pattern slots. */
  max: number;
  /** What held it down. */
  by: "pads" | "patterns" | "chops" | "none";
}

/**
 * How many chops the export can make. `patternSlots` is Koala's free pattern slots; it only limits the multiple-pattern export (one pattern per chop),
 * the one-pattern export needs a single slot.
 */
export function chopLimit(destinations: number, chopsMarked: number, patternSlots: number, pattern: "multiple" | "single"): ChopLimit {
  const bySlots = pattern === "multiple" ? patternSlots : Infinity;
  const max = Math.max(0, Math.min(destinations, chopsMarked, bySlots));
  if (max === 0 && destinations === 0) return { max, by: "none" };
  if (max === destinations && destinations <= chopsMarked && destinations <= bySlots) return { max, by: "pads" };
  if (max === bySlots) return { max, by: "patterns" };
  return { max, by: "chops" };
}

/** The pads the first `count` chops go to, in chronological order. */
export const assign = (destinations: readonly number[], count: number): number[] => destinations.slice(0, Math.max(0, count));

/** The occupied pads among those the chops are assigned to: what will be overwritten. */
export function overwrites(pads: readonly DestinationPad[], assigned: readonly number[]): DestinationPad[] {
  const used = new Set(assigned);
  return pads.filter((p) => used.has(p.index) && p.occupied);
}

/** The words of the confirmation: how many, and which banks and pads. */
export function overwriteMessage(list: readonly DestinationPad[]): string {
  const lines = BANK_LETTERS.map((letter, b) => {
    const there = list.filter((p) => Math.floor(p.index / PADS_PER_BANK) === b);
    return there.length ? `Bank ${letter}: ${there.map((p) => (p.name ? `${padName(p.index)} (${p.name})` : padName(p.index))).join(", ")}` : "";
  }).filter(Boolean);
  return `${list.length} existing sample${list.length === 1 ? "" : "s"} will be replaced. The sample data on these pads is overwritten:\n\n${lines.join("\n")}`;
}
