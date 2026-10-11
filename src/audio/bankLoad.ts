// The four loaders, one for each bank of pads. A loader takes a folder the user points it at and fills only its own part of the grid:
//
//   Bank A  "Load Bank A: Drums"        a drum pack with subfolders; the sound type comes from hierarchy, filenames and corrections.
//                                       Ten kicks, ten snares, five closed and five open hats, five of every other drum type.
//   Bank B  "Load Bank B: Melodic Loops" a folder of sound files and nothing else; twelve of them at random go on the top three rows.
//           "Fill Bank B: 808 & Bass"   a pack with 808 or bass subfolders; the bottom row holds two basses and two 808s.
//   Bank C  "Fill Bank C: One Shots"    a folder of sound files and nothing else; sixteen at random.
//   Bank D  the acapella chop, see findAcapellaPair in song/stems.ts and startAcapella in App.tsx.
//
// Every sound is named by its type and a number ("Kick 1", "Snare 2", "808 1"), not by its file name, and written to the project under that
// name. Whatever a bank's pads do not hold stays in the hot-swap pool as a spare. Bass, melodic loops and one-shots are tuned by default.
import { allocateKit, generationSlots, sameKitType, type AdditionalBanks, type KitShortage } from "./kitGeneration";
import type { SampleClassification } from "./sampleClassification";
import { layoutById } from "./fingerLayouts";
import type { FingerLayout } from "./fingerLayouts";
import { categoryLabel, is808Name, type CategoryId } from "./classify";
import { categoryOfFile, classifyFile, fairPackOrder, shuffled, type PackFile } from "./samplePack";

export type BankLoad = "drums" | "loops" | "bass" | "oneShots" | "kit";

/** Longest a loop or one-shot may be; longer files are skipped. */
export const MAX_LOAD_SECONDS = 30;

/** How many of each drum type are pulled from a drum pack (pads and hot-swap spares together). */
export const DRUM_QUOTA: Partial<Record<CategoryId, number>> = {
  kick: 10,
  snare: 10,
  closedHat: 5,
  openHat: 5,
  clap: 5,
  cymbal: 5,
  perc: 5,
  vox: 5,
  fx: 5,
  riser: 5,
  fall: 5,
};

/** First pad of each bank-B and bank-C zone, and how many pads it has. */
export const LOOP_START = 16;
export const LOOP_PADS = 12;
export const BASS_START = 28;
/** Two ordinary basses then two 808s. */
export const BASS_PADS = 2;
export const BASS_808_PADS = 2;
export const ONE_SHOT_START = 32;
export const ONE_SHOT_PADS = 16;
/** Hot-swap spares kept beside the pads (per kind for bass). */
export const LOOP_SPARES = 4;
export const BASS_SPARES = 4;
export const ONE_SHOT_SPARES = 4;

/** The pads a loader owns: loading replaces whatever is on them. */
export const BANK_ZONES: Record<BankLoad, { start: number; end: number }> = {
  drums: { start: 0, end: 16 },
  loops: { start: LOOP_START, end: LOOP_START + LOOP_PADS },
  bass: { start: BASS_START, end: BASS_START + BASS_PADS + BASS_808_PADS },
  oneShots: { start: ONE_SHOT_START, end: ONE_SHOT_START + ONE_SHOT_PADS },
  // A kit import replaces all playable banks A–C; bank D stays reserved for chops.
  kit: { start: 0, end: 48 },
};

/** The sound types a loader's spares and pads hold, to tell which hot-swap spares it replaces. */
export function bankTakes(bank: BankLoad, category: CategoryId | undefined): boolean {
  if (bank === "kit") return category !== undefined;
  if (bank === "drums") return category !== undefined && category in DRUM_QUOTA;
  if (bank === "loops") return category === "melodicLoop";
  if (bank === "bass") return category === "bass";
  return category === "melodic";
}

/** The words a sound's name and pad are made of, per type. `short` is what the pad's caption says. */
interface Stem {
  category: CategoryId;
  label: string;
  short: string;
  is808?: boolean;
}

const STEMS: Stem[] = [
  { category: "kick", label: "Kick", short: "Kick" },
  { category: "snare", label: "Snare", short: "Snare" },
  { category: "clap", label: "Clap", short: "Clap" },
  { category: "closedHat", label: "Closed Hat", short: "Closed" },
  { category: "openHat", label: "Open Hat", short: "Open" },
  { category: "cymbal", label: "Cymbal", short: "Cymbal" },
  { category: "perc", label: "Perc", short: "Perc" },
  { category: "vox", label: "Vox", short: "Vox" },
  { category: "fx", label: "FX", short: "FX" },
  { category: "riser", label: "Riser", short: "Riser" },
  { category: "fall", label: "Fall", short: "Fall" },
  { category: "fxLoop", label: "FX Loop", short: "FX loop" },
  { category: "voxLoop", label: "Vocal Loop", short: "Vox loop" },
  { category: "bassLoop", label: "Bass Loop", short: "Bass loop" },
  { category: "drumLoop", label: "Drum Loop", short: "Drum loop" },
  { category: "percLoop", label: "Perc Loop", short: "Perc loop" },
  { category: "other", label: "Other", short: "Other" },
  { category: "bass", label: "808", short: "808", is808: true },
  { category: "bass", label: "Bass", short: "Bass" },
  { category: "melodicLoop", label: "Loop", short: "Loop" },
  { category: "melodic", label: "One Shot", short: "Shot" },
];

const stemOf = (category: CategoryId, is808?: boolean): Stem => STEMS.find((s) => s.category === category && !!s.is808 === !!is808) ?? { category, label: categoryLabel(category), short: categoryLabel(category) };

/** The name a loaded sound is written under: "Kick 1.wav". It is what the project, the swap list and the pad's label are made from. */
export const bankFileName = (category: CategoryId, number: number, is808?: boolean): string => `${stemOf(category, is808).label} ${number}.wav`;

export interface NumberedName {
  category: CategoryId;
  is808?: boolean;
  number: number;
  label: string;
  caption: string;
}

/** Reads a name made by `bankFileName`, or null for any other name. */
export function parseBankName(fileName: string): NumberedName | null {
  const m = fileName.match(/^(.+) (\d+)\.wav$/i);
  if (!m) return null;
  const stem = STEMS.find((s) => s.label.toLowerCase() === m[1].toLowerCase());
  if (!stem) return null;
  const number = Number(m[2]);
  return { category: stem.category, is808: stem.is808, number, label: `${stem.label} ${number}`, caption: `${stem.short} ${number}` };
}

/** The numbered label of a sound ("Kick 1"), as long as it is still the type its name says; undefined for anything else. */
export function numberedLabel(pad: { name: string; category?: CategoryId }): { label: string; caption: string } | undefined {
  const parsed = parseBankName(pad.name);
  return parsed && parsed.category === pad.category ? parsed : undefined;
}

/** A group of files of one type, shuffled, to pull `want` sounds from. */
export interface BankGroup<T = unknown> {
  category: CategoryId;
  is808?: boolean;
  candidates: PackFile<T>[];
  /** How many to pull, pads and spares together. */
  want: number;
}

/** What a loader took from a folder. */
export interface BankPlan<T = unknown> {
  groups: BankGroup<T>[];
  /** What is wrong with the folder, for an alert, when nothing can be loaded from it. */
  problem?: string;
}

const hasSubfolders = (files: { folders: string[] }[]) => files.some((f) => f.folders.length > 0);

/** Bank A: typed folders supply context and names refine generic folders and subtypes. */
export function planDrums<T>(files: PackFile<T>[], random: () => number = Math.random): BankPlan<T> {
  const byType = new Map<CategoryId, PackFile<T>[]>();
  for (const file of files) {
    const category = categoryOfFile([...(file.rootFolder ? [file.rootFolder] : []), ...file.folders], file.name);
    if (!(category in DRUM_QUOTA)) continue;
    const classification = file.classification ?? classifyFile([...(file.rootFolder ? [file.rootFolder] : []), ...file.folders], file.name);
    byType.set(category, [...(byType.get(category) ?? []), { ...file, classification }]);
  }
  const groups = (Object.keys(DRUM_QUOTA) as CategoryId[])
    .filter((c) => byType.has(c))
    .map((category) => ({ category, candidates: shuffled(byType.get(category)!, random), want: DRUM_QUOTA[category]! }));
  if (!groups.length) return { groups, problem: "No drum subfolders were found in that folder. Choose a drum pack whose subfolders are named by sound (Kicks, Snares, Hi Hats, Claps...)." };
  return { groups };
}

/** Bank B's bottom row: files in subfolders named 808 or bass. */
export function planBass<T>(files: PackFile<T>[], random: () => number = Math.random): BankPlan<T> {
  const bass = files.filter((f) => categoryOfFile([...(f.rootFolder ? [f.rootFolder] : []), ...f.folders], f.name) === "bass");
  const eights = bass.filter((f) => [...(f.rootFolder ? [f.rootFolder] : []), ...f.folders].some(is808Name));
  const plain = bass.filter((f) => !eights.includes(f));
  const groups: BankGroup<T>[] = [];
  if (plain.length) groups.push({ category: "bass", candidates: shuffled(plain, random), want: BASS_PADS + BASS_SPARES });
  if (eights.length) groups.push({ category: "bass", is808: true, candidates: shuffled(eights, random), want: BASS_808_PADS + BASS_SPARES });
  if (!groups.length) return { groups, problem: "No 808 or bass subfolders were found in that folder. Choose a drum pack with a subfolder named 808, 808s or Bass." };
  return { groups };
}

/** A folder for the loops or one-shots: it holds sound files and nothing else, so any of them may be taken. */
function planFlat<T>(files: PackFile<T>[], category: CategoryId, want: number, random: () => number): BankPlan<T> {
  if (hasSubfolders(files)) return { groups: [], problem: "That folder has subfolders. Choose a folder that holds only sound files, with nothing inside it but the sounds themselves." };
  if (!files.length) return { groups: [], problem: "No audio files (wav, aiff, flac, mp3, ogg or m4a) were found in that folder." };
  const candidates = files.filter((file) => categoryOfFile([...(file.rootFolder ? [file.rootFolder] : []), ...file.folders], file.name) === category);
  if (!candidates.length) return { groups: [], problem: `No ${category === "melodicLoop" ? "melodic loops" : "melodic one shots"} were identified by folder name. Choose a folder named for its sound type.` };
  return { groups: [{ category, candidates: shuffled(candidates, random), want }] };
}

/** Bank B's top twelve pads: melodic loops, taken at random (and tuned by default). */
export const planLoops = <T>(files: PackFile<T>[], random: () => number = Math.random) => planFlat(files, "melodicLoop", LOOP_PADS + LOOP_SPARES, random);

/** Bank C: one-shots, taken at random (and tuned by default). */
export const planOneShots = <T>(files: PackFile<T>[], random: () => number = Math.random) => planFlat(files, "melodic", ONE_SHOT_PADS + ONE_SHOT_SPARES, random);

/**
 * Use resolved library classifications, or classify hierarchy and filenames. Only requested Types enter the plan.
 * Missing categories have no group, so the placement leaves their pads empty.
 */
export interface KitOptions { additionalBanks?: AdditionalBanks; layout?: FingerLayout; balancePacks?: boolean }
export function planKit<T>(files: PackFile<T>[], random: () => number = Math.random, options: KitOptions = {}): BankPlan<T> {
  if (!files.length) return { groups: [], problem: "No audio files were found in that library." };
  const slots = generationSlots(options.layout ?? layoutById(null), options.additionalBanks ?? 0);
  const buckets = new Map<string, BankGroup<T>>();
  const seen = new Set<string>();
  for (const file of files) {
    const classification = file.classification ?? classifyFile([...(file.rootFolder ? [file.rootFolder] : []), ...file.folders], file.name);
    const category = classification.category;
    if (!slots.some((slot) => sameKitType(slot.category, category))) continue;
    const identity = file.libraryId ?? file.sourcePath ?? [...file.folders, file.name].join("/");
    if (seen.has(identity)) continue;
    seen.add(identity);
    const subtype = classification.subtype ?? "";
    const key = `${category}:${subtype}`;
    const group = buckets.get(key) ?? { category, is808: (category === "bass" || category === "bassLoop") && subtype === "808" || undefined, candidates: [], want: slots.filter((slot) => sameKitType(slot.category, category)).length + 4 };
    group.candidates.push({ ...file, classification }); buckets.set(key, group);
  }
  const groups = [...buckets.values()].map((group) => ({ ...group, candidates: options.balancePacks === false ? shuffled(group.candidates, random) : fairPackOrder(group.candidates, random) }));
  return groups.length ? { groups } : { groups, problem: "No samples match the selected pad Types. Review classifications or edit the template." };
}

export const planBank = <T>(bank: BankLoad, files: PackFile<T>[], random: () => number = Math.random, options: KitOptions = {}): BankPlan<T> =>
  bank === "kit" ? planKit(files, random, options) : bank === "drums" ? planDrums(files, random) : bank === "bass" ? planBass(files, random) : bank === "loops" ? planLoops(files, random) : planOneShots(files, random);

/** A sound that was pulled, named and numbered. */
export interface PlacedSound {
  /** Identifies the sound among the others being placed. */
  key: number;
  category: CategoryId;
  is808?: boolean;
  classification?: SampleClassification;
  identity?: string;
}

export interface BankPlacement {
  /** Sound key -> pad. */
  positions: Map<number, number>;
  shortages?: KitShortage[];
  /** Silent "add Kick" pads for the layout's gaps (bank A only). */
  placeholders: { index: number; kind: "missing"; label: string }[];
  /** Ghost snare and soft kick slots, made from the kit's own sounds (bank A only). */
  ghosts: { index: number; kind: "ghostSnare" | "softKick"; sourceKey: number }[];
  /** Sounds no pad took; they wait in the hot-swap pool. */
  spares: number[];
}

/** Where the pulled sounds sit: bank A by the drum layout, the others in order (the loops first-come on the top rows, the bass row two basses then two 808s). */
export function placeBank(bank: BankLoad, sounds: PlacedSound[], layout: FingerLayout, options: { additionalBanks?: AdditionalBanks; locked?: ReadonlySet<number>; excluded?: ReadonlySet<string> } = {}): BankPlacement {
  const positions = new Map<number, number>();
  const out: BankPlacement = { positions, placeholders: [], ghosts: [], spares: [] };
  if (bank === "kit" || bank === "drums") {
    const slots = generationSlots(layout, bank === "kit" ? options.additionalBanks ?? 0 : 0);
    const allocated = allocateKit(sounds, slots, options.locked, options.excluded);
    for (const [key, index] of allocated.positions) positions.set(key, index);
    out.shortages = allocated.shortages;
  } else if (bank === "bass") {
    // Two ordinary basses then two 808s; a shortfall in one kind is made up from the other.
    const plain = sounds.filter((s) => !s.is808);
    const eights = sounds.filter((s) => s.is808);
    for (let n = 0; n < BASS_PADS + BASS_808_PADS; n++) {
      const own = n < BASS_PADS ? plain : eights;
      const other = n < BASS_PADS ? eights : plain;
      const pick = own.shift() ?? other.shift();
      if (pick) positions.set(pick.key, BASS_START + n);
    }
  } else {
    const { start, end } = BANK_ZONES[bank];
    sounds.slice(0, end - start).forEach((s, n) => positions.set(s.key, start + n));
  }
  out.spares = sounds.filter((s) => !positions.has(s.key)).map((s) => s.key);
  return out;
}

/**
 * Kit slots (bank A) that hold no sound or a silent placeholder take spares of their own Type only.
 * Returns slot -> index into `spares`; automatic family substitutions are not allowed.
 */
export function fillKitGaps(pads: Record<number, { placeholder?: unknown; ghost?: unknown } | undefined>, layout: FingerLayout, spares: { category?: CategoryId }[]): Map<number, number> {
  const out = new Map<number, number>();
  const taken = new Set<number>();
  const take = (ok: (s: { category?: CategoryId }) => boolean) => {
    const at = spares.findIndex((s, n) => !taken.has(n) && s.category !== undefined && ok(s));
    if (at >= 0) taken.add(at);
    return at;
  };
  const gaps = layout.slots.map((slot, i) => ({ slot, i })).filter(({ slot, i }) => !slot.ghostOf && (!pads[i] || pads[i]!.placeholder));
  for (const { slot, i } of gaps) {
    const at = take((s) => s.category === slot.category);
    if (at >= 0) out.set(i, at);
  }
  return out;
}
