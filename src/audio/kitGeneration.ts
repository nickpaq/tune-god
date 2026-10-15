import { categoryLabel, type CategoryId } from "./classify";
import { layoutById, type LayoutSlot } from "./fingerLayouts";
import type { SampleClassification } from "./sampleClassification";

// One preset: A is the MPC drum layout. B and C each mix sound families in fixed rows.
const BANK_B: CategoryId[] = [
  "melodicLoop", "melodicLoop", "drumLoop", "percLoop",
  "vox", "vox", "fx", "fxLoop",
  "melodic", "melodic", "melodic", "melodic",
  "bass", "bass", "melodicLoop", "melodicLoop",
];
const BANK_C: CategoryId[] = [
  "drumLoop", "percLoop", "melodicLoop", "fxLoop",
  "vox", "voxLoop", "fx", "fx",
  "melodic", "melodic", "melodicLoop", "melodicLoop",
  "bass", "bass", "melodicLoop", "voxLoop",
];

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
  for (const [index, slot] of slots.entries()) {
    if (occupied.has(index) || !remaining.length) continue;
    const eligible = remaining.filter(sound => slot.category !== "melodicLoop" || sound.category !== "bassLoop");
    if (!eligible.length) continue;
    const candidate = eligible[Math.min(eligible.length - 1, Math.floor(random() * eligible.length))];
    const at = remaining.indexOf(candidate);
    const [sound] = remaining.splice(at, 1);
    occupied.add(index);
    positions.set(sound.key, index);
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
