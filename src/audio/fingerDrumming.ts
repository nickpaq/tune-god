// Pure arranger for the finger-drumming layout: decides where every sound goes across the four
// banks and which placeholder pads fill the gaps. No React and no audio, so it is easy to test.
//
//   Bank A   the chosen layout, filled from the user's drums and FX ("add <category>" where a slot has none).
//            A ghost snare or soft kick slot holds a copy for now; the export only makes it if the slot stays unfilled.
//   Banks B-D   everything that isn't a drum, lowest to highest (bass, melodic, loops, other) from the start of
//            bank B; the drums the layout had no slot for are backfilled from the end of bank D.
//            If the project is nearly full, the two meet and the overflow takes bank A's "missing" pads.
//   Every pad still free at the end becomes an "Empty pad" placeholder.
import { categoryIndex, categoryLabel, isKitCategory, type CategoryId } from "./classify";
import type { GhostKind } from "./ghost";
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
  /** A bass sound that is an 808, which a sample pack keeps apart from ordinary bass. */
  is808?: boolean;
}

export interface ArrangePlaceholder {
  index: number;
  kind: "missing" | "empty";
  label: string;
}

/** A quieter copy of a real sound, made for a ghost snare or soft kick slot. */
export interface ArrangeGhost {
  index: number;
  kind: GhostKind;
  /** The sound (by key) the copy is made from. */
  sourceKey: number;
}

export interface FingerArrangement {
  ghosts: ArrangeGhost[];
  /** Sound key -> new pad index. */
  positions: Map<number, number>;
  placeholders: ArrangePlaceholder[];
}

export const EMPTY_PAD_LABEL = "Empty pad";

/** Lowest-to-highest order of the non-drum categories. */
const TONAL_ORDER: CategoryId[] = ["bass", "melodic", "melodicLoop", "percLoop", "drumLoop", "other"];

function frequency(s: ArrangeSound): number {
  if (s.midi != null) return 440 * 2 ** ((s.midi - 69) / 12);
  return s.centroid ?? 0;
}

const byFrequency = (a: ArrangeSound, b: ArrangeSound) => frequency(a) - frequency(b);

/** Drums a slot may borrow when no sound matches it exactly: a clap can stand in for a snare, an open hat for a closed one. */
export const SUBSTITUTE_GROUP: Partial<Record<CategoryId, string>> = {
  kick: "kick",
  snare: "snare",
  clap: "snare",
  closedHat: "hat",
  openHat: "hat",
  cymbal: "hat",
  fx: "fx",
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
 * Fills bank A with an exact category match per slot; slots still empty then take a leftover drum of the same
 * family, bottom row first (the slots under the thumbs).
 */
function fillKit(layout: FingerLayout, drums: ArrangeSound[]): Kit {
  const slots: (ArrangeSound | null)[] = Array(PADS_PER_BANK).fill(null);
  const used = new Set<number>();

  for (const category of new Set(layout.slots.filter((s) => !s.ghostOf).map((s) => s.category))) {
    const positions = layout.slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.category === category && !s.ghostOf)
      .sort((a, b) => slotRank(a.i) - slotRank(b.i));
    const candidates = drums.filter((d) => d.category === category).sort(byFrequency);
    positions.forEach(({ i }, n) => {
      const pick = candidates[n];
      if (!pick) return;
      slots[i] = pick;
      used.add(pick.key);
    });
  }

  for (let i = layout.slots.length - 1; i >= 0; i--) {
    if (slots[i] || layout.slots[i].ghostOf) continue;
    const pick = drums.find((d) => !used.has(d.key) && SUBSTITUTE_GROUP[d.category!] === SUBSTITUTE_GROUP[layout.slots[i].category]);
    if (!pick) continue;
    slots[i] = pick;
    used.add(pick.key);
  }

  return { slots, leftover: drums.filter((d) => !used.has(d.key)) };
}

/** A sample pack's bank B holds eight melodic loops (its first two rows) and then eight melodics (the last two). */
const PACK_LOOP_PADS = 8;
const PACK_MELODIC_PADS = 8;
/** Bank C starts with two ordinary basses and two 808s. */
const PACK_BASS_PADS = 2;

/**
 * Where a sample pack's non-kit sounds go: bank B takes eight melodic loops then eight melodics; bank C two basses, two
 * 808s (all classified as bass) and then every other type (drum loops, perc loops, other, lowest to highest); bank D stays
 * empty for the user. Sounds that do not fit their place take the first free pad of banks B, C then D, so none is lost.
 */
function placePack(tonal: ArrangeSound[], leftoverDrums: ArrangeSound[], taken: Set<number>, positions: Map<number, number>): void {
  const of = (c: CategoryId) => tonal.filter((s) => (s.category ?? "other") === c).sort(byFrequency);
  const bass = of("bass");
  const overflow: ArrangeSound[] = [];
  const put = (list: ArrangeSound[], start: number, count: number) => {
    list.slice(0, count).forEach((s, n) => positions.set(s.key, start + n));
    overflow.push(...list.slice(count));
  };
  const bankC = PADS_PER_BANK * 2;
  put(of("melodicLoop"), PADS_PER_BANK, PACK_LOOP_PADS);
  put(of("melodic"), PADS_PER_BANK + PACK_LOOP_PADS, PACK_MELODIC_PADS);
  // Two ordinary-bass pads then two 808 pads; a shortfall in one kind is made up from the other, as the planner does.
  const spare = { plain: bass.filter((s) => !s.is808), eights: bass.filter((s) => s.is808) };
  for (let n = 0; n < 2 * PACK_BASS_PADS; n++) {
    const ownKind = n < PACK_BASS_PADS ? spare.plain : spare.eights;
    const otherKind = n < PACK_BASS_PADS ? spare.eights : spare.plain;
    const pick = ownKind.shift() ?? otherKind.shift();
    if (pick) positions.set(pick.key, bankC + n);
  }
  overflow.push(...spare.plain, ...spare.eights);
  const rest = TONAL_ORDER.filter((c) => c !== "bass" && c !== "melodic" && c !== "melodicLoop").flatMap(of);
  put(rest, bankC + 2 * PACK_BASS_PADS, PADS_PER_BANK - 2 * PACK_BASS_PADS);
  const used = new Set([...taken, ...positions.values()]);
  const free: number[] = [];
  for (let i = PADS_PER_BANK; i < PAD_COUNT; i++) if (!used.has(i)) free.push(i);
  [...overflow, ...leftoverDrums].forEach((s, n) => {
    if (free[n] !== undefined) positions.set(s.key, free[n]);
  });
}

export function arrangeFingerDrumming(sounds: ArrangeSound[], layout: FingerLayout, { pack = false }: { pack?: boolean } = {}): FingerArrangement {
  const drums = sounds.filter((s) => isKitCategory(s.category));
  const tonal = sounds.filter((s) => !isKitCategory(s.category));
  const kit = fillKit(layout, drums);
  const leftoverDrums = kit.leftover
    .slice()
    .sort((a, b) => categoryIndex(a.category ?? "other") - categoryIndex(b.category ?? "other") || byFrequency(a, b));

  const positions = new Map<number, number>();
  const placeholders = new Map<number, ArrangePlaceholder>();
  const ghosts: ArrangeGhost[] = [];
  kit.slots.forEach((s, i) => {
    if (layout.slots[i].ghostOf) return;
    if (s) positions.set(s.key, i);
    else placeholders.set(i, { index: i, kind: "missing", label: `add ${layout.slots[i].label}` });
  });
  // A ghost slot holds a quieter copy of the kit's own snare or kick (the first one the layout fills, bottom row first).
  layout.slots.forEach((slot, i) => {
    if (!slot.ghostOf) return;
    const source = layout.slots
      .map((s, j) => ({ s, j }))
      .filter(({ s, j }) => !s.ghostOf && s.category === slot.ghostOf && kit.slots[j])
      .sort((a, b) => slotRank(a.j) - slotRank(b.j))[0];
    if (source) ghosts.push({ index: i, kind: slot.ghostOf === "snare" ? "ghostSnare" : "softKick", sourceKey: kit.slots[source.j]!.key });
    else placeholders.set(i, { index: i, kind: "missing", label: `add ${categoryLabel(slot.ghostOf!)}` });
  });

  if (pack) {
    placePack(tonal, leftoverDrums, new Set([...placeholders.keys(), ...ghosts.map((g) => g.index)]), positions);
    const taken = new Set([...positions.values(), ...placeholders.keys(), ...ghosts.map((g) => g.index)]);
    for (let index = 0; index < PAD_COUNT; index++) {
      if (!taken.has(index)) placeholders.set(index, { index, kind: "empty", label: EMPTY_PAD_LABEL });
    }
    return { positions, ghosts, placeholders: [...placeholders.values()].sort((a, b) => a.index - b.index) };
  }

  const ordered = TONAL_ORDER.flatMap((c) => tonal.filter((s) => (s.category ?? "other") === c).sort(byFrequency));
  const back: number[] = [];
  for (let i = PAD_COUNT - 1; i >= PADS_PER_BANK; i--) back.push(i);
  if (ordered.length + leftoverDrums.length <= back.length) {
    // Room for everyone: melodic sounds from the start of bank B, extra drums from the end of bank D.
    ordered.forEach((s, n) => positions.set(s.key, PADS_PER_BANK + n));
    leftoverDrums.forEach((s, n) => positions.set(s.key, back[n]));
  } else {
    // Nearly full: one run through banks B to D, then bank A's "missing" pads (last first), so real sounds win over placeholders.
    const free: number[] = [];
    for (let i = PADS_PER_BANK; i < PAD_COUNT; i++) free.push(i);
    free.push(...[...placeholders.keys()].sort((a, b) => b - a));
    [...ordered, ...leftoverDrums].forEach((s, n) => {
      const index = free[n];
      if (index === undefined) return;
      positions.set(s.key, index);
      placeholders.delete(index);
    });
  }

  const taken = new Set([...positions.values(), ...placeholders.keys(), ...ghosts.map((g) => g.index)]);
  for (let index = 0; index < PAD_COUNT; index++) {
    if (!taken.has(index)) placeholders.set(index, { index, kind: "empty", label: EMPTY_PAD_LABEL });
  }

  return { positions, ghosts, placeholders: [...placeholders.values()].sort((a, b) => a.index - b.index) };
}
