// Pure arranger for the finger-drumming layout: decides where every sound goes across the four
// banks and which placeholder pads fill the gaps. No React and no audio, so it is easy to test.
//
//   Bank A   the chosen layout, filled from the user's drums ("add <category>" where a slot has none)
//   Bank B   a second kit from the leftover drums, but only when they include a kick, a snare and a hat;
//            otherwise B is left unarranged
//   Banks C, D   everything that isn't a drum, lowest to highest (bass, melodic, loops, FX, other),
//            then any drums still left over; overflow past D continues on B's free pads
//   Every pad still free at the end becomes an "Empty pad" placeholder.
import { categoryIndex, isDrumCategory, type CategoryId } from "./classify";
import type { FingerLayout } from "./fingerLayouts";
import { PAD_COUNT, PADS_PER_BANK } from "./padMoves";

export interface ArrangeSound {
  /** Identifies the sound (its original slot). */
  key: number;
  category: CategoryId | undefined;
  /** Detected pitch (fractional MIDI), when it has one. */
  midi?: number | null;
  /** Spectral centroid in Hz, used to order sounds with no clear pitch. */
  centroid?: number;
}

export interface ArrangePlaceholder {
  index: number;
  kind: "missing" | "empty";
  label: string;
}

export interface FingerArrangement {
  /** Sound key -> new pad index. */
  positions: Map<number, number>;
  placeholders: ArrangePlaceholder[];
}

export const EMPTY_PAD_LABEL = "Empty pad";

/** Lowest-to-highest order of the non-drum categories. */
const TONAL_ORDER: CategoryId[] = ["bass", "melodic", "melodicLoop", "percLoop", "drumLoop", "fx", "other"];

function frequency(s: ArrangeSound): number {
  if (s.midi != null) return 440 * 2 ** ((s.midi - 69) / 12);
  return s.centroid ?? 0;
}

const byFrequency = (a: ArrangeSound, b: ArrangeSound) => frequency(a) - frequency(b);

/** Drums a slot may borrow when no sound matches it exactly: a clap can stand in for a snare, an open hat for a closed one. */
const SUBSTITUTE_GROUP: Partial<Record<CategoryId, string>> = {
  kick: "kick",
  snare: "snare",
  clap: "snare",
  closedHat: "hat",
  openHat: "hat",
  perc: "perc",
  vox: "vox",
};

/** Where a slot sits among same-category slots: the bottom row first (the pads under the thumbs), left to right within a row. */
function slotRank(position: number): number {
  return (3 - Math.floor(position / 4)) * 4 + (position % 4);
}

interface Kit {
  slots: (ArrangeSound | null)[];
  leftover: ArrangeSound[];
}

/**
 * Fills one bank of the layout with an exact category match per slot. With `substitute`, slots still empty
 * then take a leftover drum of the same category, bottom row first (the slots under the thumbs).
 */
function fillKit(layout: FingerLayout, drums: ArrangeSound[], substitute: boolean): Kit {
  const slots: (ArrangeSound | null)[] = Array(PADS_PER_BANK).fill(null);
  const used = new Set<number>();

  for (const category of new Set(layout.slots.map((s) => s.category))) {
    const positions = layout.slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.category === category)
      .sort((a, b) => slotRank(a.i) - slotRank(b.i));
    const candidates = drums.filter((d) => d.category === category).sort(byFrequency);
    positions.forEach(({ i }, n) => {
      const pick = candidates[n];
      if (!pick) return;
      slots[i] = pick;
      used.add(pick.key);
    });
  }

  if (substitute) {
    for (let i = layout.slots.length - 1; i >= 0; i--) {
      if (slots[i]) continue;
      const pick = drums.find((d) => !used.has(d.key) && SUBSTITUTE_GROUP[d.category!] === SUBSTITUTE_GROUP[layout.slots[i].category]);
      if (!pick) continue;
      slots[i] = pick;
      used.add(pick.key);
    }
  }

  return { slots, leftover: drums.filter((d) => !used.has(d.key)) };
}

const hasCore = (drums: ArrangeSound[]) =>
  [["kick"], ["snare"], ["closedHat", "openHat"]].every((group) => drums.some((d) => group.includes(d.category!)));

export function arrangeFingerDrumming(sounds: ArrangeSound[], layout: FingerLayout): FingerArrangement {
  const drums = sounds.filter((s) => isDrumCategory(s.category));
  const tonal = sounds.filter((s) => !isDrumCategory(s.category));

  // A second kit is judged on what bank A's exact matches leave over. If there is one, bank A keeps only
  // its exact matches so those leftovers stay available for bank B; otherwise bank A may borrow them.
  const exactA = fillKit(layout, drums, false);
  const secondKit = hasCore(exactA.leftover);
  const kitA = secondKit ? exactA : fillKit(layout, drums, true);
  const kitB = secondKit ? fillKit(layout, exactA.leftover, true) : null;
  const leftoverDrums = (kitB ? kitB.leftover : kitA.leftover)
    .slice()
    .sort((a, b) => categoryIndex(a.category ?? "other") - categoryIndex(b.category ?? "other") || byFrequency(a, b));

  const positions = new Map<number, number>();
  const placeholders = new Map<number, ArrangePlaceholder>();
  const place = (kit: Kit, bank: number) =>
    kit.slots.forEach((s, i) => {
      const index = bank * PADS_PER_BANK + i;
      if (s) positions.set(s.key, index);
      else placeholders.set(index, { index, kind: "missing", label: `add ${layout.slots[i].label}` });
    });
  place(kitA, 0);
  if (kitB) place(kitB, 1);

  const ordered = [
    ...TONAL_ORDER.flatMap((c) => tonal.filter((s) => (s.category ?? "other") === c).sort(byFrequency)),
    ...leftoverDrums,
  ];

  // Banks C and D first, then B's free pads, then (only if the project is nearly full) the "missing" pads,
  // last first, so real sounds always win over placeholders.
  const free: number[] = [];
  for (let i = 2 * PADS_PER_BANK; i < PAD_COUNT; i++) free.push(i);
  if (!kitB) for (let i = PADS_PER_BANK; i < 2 * PADS_PER_BANK; i++) free.push(i);
  free.push(...[...placeholders.keys()].sort((a, b) => b - a));

  ordered.forEach((s, n) => {
    const index = free[n];
    if (index === undefined) return;
    positions.set(s.key, index);
    placeholders.delete(index);
  });

  const taken = new Set([...positions.values(), ...placeholders.keys()]);
  for (let index = 0; index < PAD_COUNT; index++) {
    if (!taken.has(index)) placeholders.set(index, { index, kind: "empty", label: EMPTY_PAD_LABEL });
  }

  return { positions, placeholders: [...placeholders.values()].sort((a, b) => a.index - b.index) };
}
