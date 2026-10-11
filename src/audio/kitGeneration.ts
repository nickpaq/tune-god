import type { CategoryId } from "./classify";
import type { FingerLayout, LayoutSlot } from "./fingerLayouts";
import type { SampleClassification } from "./sampleClassification";

export type AdditionalBanks = 0 | 1 | 2;
const slot = (
  category: CategoryId,
  label = category,
  subtype?: string,
): LayoutSlot => ({ category, label, subtype });
const hybrid: CategoryId[] = [
  "bass",
  "bass",
  "bassLoop",
  "bass",
  "melodic",
  "melodic",
  "melodic",
  "melodic",
  "vox",
  "vox",
  "fx",
  "riser",
  "melodicLoop",
  "melodicLoop",
  "drumLoop",
  "voxLoop",
];
const instruments: CategoryId[] = [
  "bass",
  "bass",
  "bass",
  "bass",
  ...Array<CategoryId>(12).fill("melodic"),
];
const extras: CategoryId[] = [
  "drumLoop",
  "drumLoop",
  "percLoop",
  "drumLoop",
  "melodicLoop",
  "melodicLoop",
  "melodicLoop",
  "melodicLoop",
  "bassLoop",
  "bassLoop",
  "voxLoop",
  "voxLoop",
  "vox",
  "riser",
  "fall",
  "fxLoop",
];

export function generationSlots(
  layout: FingerLayout,
  additional: AdditionalBanks,
): LayoutSlot[] {
  return [
    ...layout.slots,
    ...(additional
      ? (additional === 1 ? hybrid : instruments).map((category) =>
          slot(category),
        )
      : []),
    ...(additional === 2 ? extras.map((category) => slot(category)) : []),
  ];
}
export interface KitSound {
  key: number;
  category: CategoryId;
  classification?: SampleClassification;
  identity?: string;
}
export interface KitShortage {
  index: number;
  label: string;
  category: CategoryId;
  subtype?: string;
}

/** Specific subtypes reserve their candidates before generic slots; each sample can be used only once. */
export function allocateKit(
  sounds: KitSound[],
  slots: LayoutSlot[],
  locked: ReadonlySet<number> = new Set(),
  excluded: ReadonlySet<string> = new Set(),
): { positions: Map<number, number>; shortages: KitShortage[] } {
  const positions = new Map<number, number>();
  const used = new Set<string>(excluded);
  const occupied = new Set<number>(locked);
  for (const { slot, index } of slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => Number(!!b.slot.subtype) - Number(!!a.slot.subtype))) {
    if (occupied.has(index)) continue;
    const candidate = sounds.find(
      (sound) =>
        !used.has(sound.identity ?? String(sound.key)) &&
        sound.category === slot.category &&
        (!slot.subtype || sound.classification?.subtype === slot.subtype),
    );
    if (!candidate) continue;
    used.add(candidate.identity ?? String(candidate.key));
    occupied.add(index);
    positions.set(candidate.key, index);
  }
  const shortages = slots.flatMap((slot, index) =>
    occupied.has(index)
      ? []
      : [
          {
            index,
            label: slot.label,
            category: slot.category,
            subtype: slot.subtype,
          },
        ],
  );
  return { positions, shortages };
}
