import { categoryLabel, isDrumCategory, type CategoryId } from "./classify";
import { layoutById, type LayoutSlot } from "./fingerLayouts";
import type { SampleClassification } from "./sampleClassification";

// One preset: A is the MPC drum layout. B and C each mix sound families in rows of 4, and every Type on them takes an even number of
// pads (2, 4 or 8, never 1, 3 or 5), side by side, so the Types sit together instead of scattering.
const BANK_B: CategoryId[] = [
  "melodicLoop", "melodicLoop", "melodicLoop", "melodicLoop",
  "drumLoop", "drumLoop", "percLoop", "percLoop",
  "vox", "vox", "fx", "fx",
  "bass", "bass", "melodic", "melodic",
];
const BANK_C: CategoryId[] = [
  "melodicLoop", "melodicLoop", "melodicLoop", "melodicLoop",
  "voxLoop", "voxLoop", "fxLoop", "fxLoop",
  "melodic", "melodic", "melodic", "melodic",
  "bass", "bass", "vox", "vox",
];

/** The first slot that is filled in groups (Bank B). Bank A's slots are single pads. */
const GROUPED_FROM = 16;

/** Runs of neighbouring slots of one Type (a row's pair or four), with their indexes. */
function slotGroups(slots: LayoutSlot[]): { category: CategoryId; start: number; indexes: number[] }[] {
  const out: { category: CategoryId; start: number; indexes: number[] }[] = [];
  slots.forEach((slot, index) => {
    const last = out[out.length - 1];
    if (last && last.category === slot.category && last.indexes[last.indexes.length - 1] === index - 1 && index % 4 !== 0) last.indexes.push(index);
    else out.push({ category: slot.category, start: index, indexes: [index] });
  });
  return out;
}

/** Exactly 48 slots, never including Bank D. */
export function generationSlots(): LayoutSlot[] {
  return [...layoutById(null).slots, ...BANK_B.concat(BANK_C).map((category) => ({ category, label: categoryLabel(category) }))];
}
export interface KitSound {
  key: number;
  category: CategoryId;
  classification?: SampleClassification;
  identity?: string;
  is808?: boolean;
}
export interface KitShortage {
  index: number;
  label: string;
  category: CategoryId;
}

/** Display the template name only when the loaded sound actually fulfills it. */
export function matchingTemplateLabel(slot: LayoutSlot | undefined, sound: Pick<KitSound, "category" | "classification">): string | undefined {
  return slot && sound.category === slot.category
    ? slot.label : undefined;
}

/** Match main Types first, then fill unmet slots randomly from available sounds. */
export function allocateKit(
  sounds: KitSound[],
  slots: LayoutSlot[],
  locked: ReadonlySet<number> = new Set(),
  excluded: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): { positions: Map<number, number>; shortages: KitShortage[] } {
  const positions = new Map<number, number>();
  const used = new Set<string>(excluded);
  const occupied = new Set<number>(locked);
  const take808 = () => sounds.find((sound) => !used.has(sound.identity ?? String(sound.key)) && sound.category === "bass" && sound.is808);
  // No kicks at all: 808s take the bottom-left pad, then the pad above it, before anything else.
  if (!sounds.some((sound) => sound.category === "kick" && !used.has(sound.identity ?? String(sound.key)))) {
    for (const index of [12, 8]) {
      const eight = slots[index]?.category === "kick" && !occupied.has(index) ? take808() : undefined;
      if (!eight) continue;
      used.add(eight.identity ?? String(eight.key));
      occupied.add(index);
      positions.set(eight.key, index);
    }
  }
  for (const [index, slot] of slots.entries()) {
    if (occupied.has(index)) continue;
    const free = (sound: KitSound) => !used.has(sound.identity ?? String(sound.key));
    // Kicks ran out before the bottom-left pad: an 808 takes it before the bass slots do.
    const candidate = sounds.find((sound) => free(sound) && sound.category === slot.category) ?? (slot.category === "kick" && index === 12 ? take808() : undefined);
    if (!candidate) continue;
    used.add(candidate.identity ?? String(candidate.key));
    occupied.add(index);
    positions.set(candidate.key, index);
  }
  const remaining = sounds.filter(sound => !positions.has(sound.key));
  // No kick and no 808 for a kick pad: any other drum takes it, before the general random fill.
  for (const index of [12, 8]) {
    if (occupied.has(index) || slots[index]?.category !== "kick") continue;
    const drums = remaining.filter(sound => isDrumCategory(sound.category) && sound.category !== "vox");
    if (!drums.length) break;
    const sound = drums[Math.min(drums.length - 1, Math.floor(random() * drums.length))];
    remaining.splice(remaining.indexOf(sound), 1);
    occupied.add(index);
    positions.set(sound.key, index);
  }
  // Banks A is filled slot by slot (its slots are single pads); B and C below are filled in groups.
  for (const [index, slot] of slots.entries()) {
    if (index >= GROUPED_FROM || occupied.has(index) || !remaining.length) continue;
    const eligible = remaining.filter(sound => slot.category !== "melodicLoop" || sound.category !== "bassLoop");
    if (!eligible.length) continue;
    const candidate = eligible[Math.min(eligible.length - 1, Math.floor(random() * eligible.length))];
    const at = remaining.indexOf(candidate);
    const [sound] = remaining.splice(at, 1);
    occupied.add(index);
    positions.set(sound.key, index);
  }
  // Banks B and C: a Type never takes an odd number of pads. A group the library could only half fill gives its odd sound back, then every group
  // of empty pads is filled with one Type at a time (a pair, or the whole group), so the Types stay together.
  const groups = slotGroups(slots).filter((group) => group.start >= GROUPED_FROM);
  for (const group of groups) {
    const placed = group.indexes.filter((index) => index >= 0 && !locked.has(index) && sounds.some((sound) => positions.get(sound.key) === index));
    if (placed.length % 2 === 1) {
      const last = placed[placed.length - 1];
      for (const [key, at] of positions) if (at === last) { positions.delete(key); occupied.delete(last); remaining.push(sounds.find((sound) => sound.key === key)!); }
    }
  }
  for (const group of groups) {
    const empty = group.indexes.filter((index) => !occupied.has(index));
    for (let at = 0; at + 1 < empty.length;) {
      const left = empty.length - at;
      const usable = (sound: KitSound) => group.category !== "melodicLoop" || sound.category !== "bassLoop";
      const counts = new Map<CategoryId, KitSound[]>();
      for (const sound of remaining) if (usable(sound)) counts.set(sound.category, [...(counts.get(sound.category) ?? []), sound]);
      // The whole rest of the group from one Type when there are enough, otherwise a pair.
      const whole = [...counts.values()].filter((list) => list.length >= left);
      const pairs = [...counts.values()].filter((list) => list.length >= 2);
      const pool = whole.length ? whole : pairs;
      if (!pool.length) break;
      const list = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
      const take = whole.length ? left : Math.min(left, list.length - (list.length % 2));
      for (let n = 0; n < take; n++) {
        const sound = list[n];
        remaining.splice(remaining.indexOf(sound), 1);
        occupied.add(empty[at + n]);
        positions.set(sound.key, empty[at + n]);
      }
      at += take;
    }
  }
  const shortages = slots.flatMap((slot, index) =>
    occupied.has(index)
      ? []
      : [
          {
            index,
            label: slot.label,
            category: slot.category,
          },
        ],
  );
  return { positions, shortages };
}
