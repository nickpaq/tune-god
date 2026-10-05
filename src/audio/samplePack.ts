// Turns a dropped sample pack (a folder tree of audio files) into the sounds for a Koala project:
// each file is classified from its folder names, then up to one pad bank's worth are picked so every
// sound type is as evenly represented as the pack allows, within a memory budget. All of this works on
// file names and sizes only; no audio is read until a file has been picked.
import { classifyByName, hatOpenness, is808Name, type CategoryId } from "./classify";

const MB = 1024 * 1024;
/** Total file size a pack import may load when nothing better is known. Decoded audio takes about three times this in memory. */
export const PACK_BYTE_BUDGET = 96 * MB;

/** The menu's choice of how much of a pack to load. */
export type PackMemory = "low" | "auto" | "high";

/**
 * How many bytes of files a pack import may load. Browsers cannot report free memory (Safari reports nothing at all),
 * so "auto" is a guess from what they do tell us: iPhones and iPads get a middling figure, Chrome's device memory
 * scales it, anything else gets a safe default. "low" and "high" let the user move it either way and see where it breaks.
 */
export function packByteBudget(
  setting: PackMemory,
  env: { ios: boolean; deviceMemoryGb?: number } = detectEnvironment(),
): number {
  if (setting === "low") return PACK_BYTE_BUDGET;
  if (env.ios) return (setting === "high" ? 384 : 192) * MB;
  const auto = env.deviceMemoryGb ? Math.min(512, Math.max(128, env.deviceMemoryGb * 64)) : 192;
  return (setting === "high" ? Math.min(1024, auto * 2) : auto) * MB;
}

/** The biggest single file a budget allows: no one sample may swallow more than a sixth of it. */
export const maxFileBytesFor = (byteBudget: number) => Math.round(byteBudget / 6);

function detectEnvironment(): { ios: boolean; deviceMemoryGb?: number } {
  if (typeof navigator === "undefined") return { ios: false };
  // iPadOS reports itself as a Mac, but only it has a touch screen.
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return { ios, deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory };
}

/** One audio file found in the pack: where it sits (folder names, outermost first) and how big it is. */
export interface PackFile<T = unknown> {
  folders: string[];
  name: string;
  size: number;
  /** Whatever the caller needs to read the file later. */
  source: T;
}

export const AUDIO_EXTENSIONS = /\.(wav|wave|aif|aiff|flac|mp3|ogg|m4a)$/i;

// Folder names are usually plural or loosely worded ("Snares", "808s", "Hi-Hats", "One Shots"), so
// folder words get their own rules; they fold the extra folders a pack has into our fifteen types.
// Order matters: the first match wins.
const FOLDER_RULES: [CategoryId | "hat", RegExp][] = [
  ["drumLoop", /\b(drum ?loops?|beat ?loops?|breaks?|breakbeats?|amens?|top ?loops?|drum ?breaks?)\b/],
  ["percLoop", /\b(perc(ussion)? ?loops?|shaker ?loops?)\b/],
  ["melodicLoop", /\b(melod(y|ic|ies) ?loops?|synth ?loops?|chord ?loops?|music ?loops?|bass ?loops?|guitar ?loops?|piano ?loops?|keys? ?loops?|arps?)\b/],
  ["kick", /\b(kicks?|kiks?|bd|bass ?drums?)\b/],
  ["clap", /\b(claps?|handclaps?)\b/],
  ["snare", /\b(snares?|rims?|rim ?shots?|side ?sticks?|snaps?|sd)\b/],
  ["openHat", /\b(open ?(hi ?)?hats?|open ?hh|ohh?|ohats?)\b/],
  ["closedHat", /\b(closed ?(hi ?)?hats?|closed ?hh|chh?|chats?|pedal ?hats?)\b/],
  ["cymbal", /\b(cymbals?|crash(es)?|rides?|chinas?|splash(es)?)\b/],
  ["hat", /\b(hi ?hats?|hats?|hh)\b/],
  ["vox", /\b(vocals?|vox|voices?|choirs?|acapellas?|chants?|breaths?|ad ?libs?|speech|shouts?)\b/],
  ["fx", /\b(fx|sfx|effects?|risers?|sweeps?|impacts?|whooshe?s?|transitions?|downlifters?|uplifters?|noises?|glitch(es)?|foley|textures?|swells?|ambien(ce|t)s?|atmos(pheres?)?|drones?|booms?|zaps?|lasers?|sirens?|reverses?|reversed|scratch(es)?|vinyl|crackles?|stingers?|stings?|rumbles?|bursts?|explosions?|sci ?fi)\b/],
  // Named percussion instruments only; the generic "perc" words come after the melodic rule so "Melodic Percussion" or "Bells & Perc" stay melodic.
  ["perc", /\b(toms?|congas?|bongos?|tamb(ourines?)?|cowbells?|claves?|wood ?blocks?|timpani|shakers?|cabasas?|guiros?)\b/],
  ["bass", /\b(808s?|bass(es)?|subs?|reese)\b/],
  ["melodic", /\b(pianos?|keys?|keyboards?|bells?|plucks?|guitars?|harps?|mallets?|marimbas?|kalimbas?|rhodes|epianos?|stabs?|vibraphones?|glock(enspiel)?s?|celestas?|chimes?|pads?|synths?|leads?|chords?|strings?|organs?|brass|horns?|flutes?|melod(y|ic|ies)|instruments?|tonal|pitched)\b/],
  ["perc", /\b(perc|percs|percussions?)\b/],
];

/** Folder names that say nothing about the sound (they only group files), so the next folder out is used. */
const GENERIC_FOLDER = /^(one ?shots?|shots?|samples?|sounds?|hits?|drums?|audio|wav|wavs|stems?|packs?|kit|kits|processed|dry|wet|[0-9 _.-]+)$/i;

/** Folder names are normalised the way file names are: separators become spaces, lower case. */
function tidy(name: string): string {
  return name.replace(/[_\-.()[\]]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The category one folder name implies, or null. */
export function categoryOfFolder(folder: string): CategoryId | "hat" | null {
  const name = tidy(folder);
  if (!name || GENERIC_FOLDER.test(name)) return null;
  const isLoop = /\bloops?\b/.test(name);
  for (const [id, re] of FOLDER_RULES) {
    if (!re.test(name)) continue;
    // "Hats & Cymbals" holds both: the file name decides, as in any hats folder.
    if (id === "cymbal" && /\b(hi ?hats?|hats?|hh)\b/.test(name)) return "hat";
    if (!isLoop) return id;
    // A "loops" folder holds loops of its type.
    if (id === "perc" || id === "percLoop") return "percLoop";
    if (id === "bass" || id === "melodic" || id === "melodicLoop") return "melodicLoop";
    return "drumLoop";
  }
  // A bare "Loops" folder gets drum loops, the commonest kind; the file name can still say otherwise.
  return isLoop ? "drumLoop" : null;
}

/**
 * The category for a file: the nearest folder that names a sound type wins (so "Drums/Snares/x.wav" is a snare),
 * then the file name's own keywords, and "other" when nothing says.
 */
export function categoryOfFile(folders: string[], fileName: string): CategoryId {
  for (let i = folders.length - 1; i >= 0; i--) {
    const byFolder = categoryOfFolder(folders[i]);
    if (byFolder === "hat") {
      // A hats folder does not say open or closed, so the file name gets to.
      const hat = classifyByName(fileName);
      if (hat === "openHat" || hat === "cymbal") return hat;
      // Inside a hats folder a bare "open" or "closed" in the file name is enough ("Open_01").
      return hatOpenness(tidy(fileName.replace(/\.[a-z0-9]+$/i, ""))) ?? "closedHat";
    }
    if (byFolder) return byFolder;
  }
  const byName = classifyByName(fileName);
  if (byName === "hat") return "closedHat";
  return byName ?? "other";
}

/** A folder that names the one-shots without saying what type they are: "One Shots", "Drum One Shots", "Single Shots". */
export function isOneShotFolder(folder: string): boolean {
  return /\b(one ?shots?|single ?shots?)\b/.test(tidy(folder)) && categoryOfFolder(folder) === null;
}

/**
 * Whether a pack can hold melodic one-shots at all: some folder is melodic ("Melodic", "Keys", "Synths", "Bells", "Plucks"...) or is a
 * plain "One Shots" folder, which can hold anything. A pack with neither almost certainly has none, so a file whose name merely sounds
 * melodic is not trusted and the melodic pads are left empty for another pack to fill (see planPackSounds).
 */
export function packHasMelodicOneShots(files: { folders: string[] }[]): boolean {
  return files.some((f) => f.folders.some((folder) => categoryOfFolder(folder) === "melodic" || isOneShotFolder(folder)));
}

/** Fisher-Yates shuffle into a new array. `random` is injectable so tests are repeatable. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface PickedSound<T = unknown> {
  file: PackFile<T>;
  category: CategoryId;
  /** A bass sound that is an 808 (named so, or in a folder named so). */
  is808?: boolean;
}

/** Hidden alternatives kept for each drum type the layout has slots for, for the hot-swap menu. */
export const PACK_ALTERNATIVES = 10;
/** Hidden alternatives kept for each of the other types (bass, melodic, loops). */
export const PACK_OTHER_ALTERNATIVES = 4;
/**
 * How the pack's sounds sit on the pads: bank A is the drum kit; bank B holds eight melodic loops then eight melodic
 * one-shots (pianos, plucks, bells); bank C holds two basses and two 808s (all classified as bass) and then shares its
 * other twelve pads between every remaining type (drum loops, perc loops, other...); bank D is left empty for the user.
 */
export const BANK_B_QUOTA: Partial<Record<CategoryId, number>> = { melodicLoop: 8, melodic: 8 };
/** Bass pads on bank C: two ordinary basses and two 808s (a shortfall in one kind is made up from the other). */
export const BASS_PADS = 2;
export const C_808_PADS = 2;
/** The rest of bank C. */
export const BANK_C_REST_PADS = 12;

/** What the planner counts as a type: the categories, with 808s apart from the other bass sounds. */
export type PlanKey = CategoryId | "808";
const categoryOfKey = (key: PlanKey): CategoryId => (key === "808" ? "bass" : key);

export interface PackPlan<T = unknown> {
  /** The sounds that go on pads. */
  visible: PickedSound<T>[];
  /** Sounds that only sit in the hot-swap menu; the export drops whichever are not chosen. */
  hidden: PickedSound<T>[];
  /** How many files the pack held in each type, and how many of those were picked (shown or hidden). */
  counts: Partial<Record<CategoryId, { found: number; picked: number }>>;
  /** Audio files left out because they were too large to load, or because the byte budget ran out. */
  skippedForSize: number;
  /** Files named like melodic one-shots in a pack with no melodic or one-shots folder, left out so the melodic pads stay empty. */
  skippedMelodicNames: number;
  totalFiles: number;
}

/** Order the types are loaded in, so a tight memory budget runs out on loops and long sounds, not on the kit. */
const BUDGET_TIERS: (PlanKey[] | "kit")[] = ["kit", ["melodic", "bass", "808"], ["vox", "fx", "perc", "melodicLoop", "percLoop", "drumLoop", "other"]];

/**
 * Plans what a pack contributes. The drum kit comes first: for every type the finger-drumming page has slots for,
 * one sound per slot goes on a pad and `alternatives` more are held back, hidden, as hot-swap options. Bank B then
 * gets its melodic loops and melodics, bank C its basses and 808s and a share of everything else, each type with its
 * own hidden alternatives (see BANK_B_QUOTA). Pads a type cannot fill stay empty: they are not given to other types,
 * so a loop bank that cannot fit the size limits stays short rather than filling with something else. Types take
 * turns within a tier of the memory budget (kit, then melodics and bass, then the rest), so the budget runs out on
 * the longest material last. A file that would push the total past `byteBudget` (or is over `maxFileBytes`) is
 * passed over for the next one of its type.
 */
export function planPackSounds<T>(
  files: PackFile<T>[],
  {
    kitSlots,
    bankB = BANK_B_QUOTA,
    bassPads = BASS_PADS,
    pads808 = C_808_PADS,
    restPads = BANK_C_REST_PADS,
    have = {},
    alternatives = PACK_ALTERNATIVES,
    otherAlternatives = PACK_OTHER_ALTERNATIVES,
    byteBudget = PACK_BYTE_BUDGET,
    maxFileBytes = maxFileBytesFor(byteBudget),
    random = Math.random,
  }: {
    /** Real (not ghost) slots per type on the finger-drumming page. */
    kitSlots: Partial<Record<CategoryId, number>>;
    bankB?: Partial<Record<CategoryId, number>>;
    /** Bank C's ordinary-bass and 808 pads to fill, and the rest of bank C. */
    bassPads?: number;
    pads808?: number;
    restPads?: number;
    /** Spares (by type) the project already holds in the hot-swap pool, which count toward the alternatives wanted. A type listed with 0 slots still gets topped up. */
    have?: Partial<Record<PlanKey, number>>;
    alternatives?: number;
    otherAlternatives?: number;
    byteBudget?: number;
    maxFileBytes?: number;
    random?: () => number;
  },
): PackPlan<T> {
  const queues = new Map<PlanKey, PackFile<T>[]>();
  const found = new Map<CategoryId, number>();
  let skippedForSize = 0;
  let skippedMelodicNames = 0;
  const melodicPossible = packHasMelodicOneShots(files);
  for (const file of files) {
    const category = categoryOfFile(file.folders, file.name);
    found.set(category, (found.get(category) ?? 0) + 1);
    if (category === "melodic" && !melodicPossible) {
      skippedMelodicNames++;
      continue;
    }
    if (file.size > maxFileBytes || file.size <= 0) {
      skippedForSize += file.size > 0 ? 1 : 0;
      continue;
    }
    const key: PlanKey = category === "bass" && [file.name, ...file.folders].some(is808Name) ? "808" : category;
    const q = queues.get(key) ?? [];
    q.push(file);
    queues.set(key, q);
  }
  for (const [key, q] of queues) queues.set(key, shuffled(q, random));
  const available = (k: PlanKey) => queues.get(k)?.length ?? 0;

  // How many of each type go on pads. Kit types get their slots, bank B's types their quotas and bank C two bass and two 808, files permitting.
  const kitTypes = (Object.keys(kitSlots) as CategoryId[]).filter((c) => kitSlots[c] !== undefined);
  const bankBTypes = (Object.keys(bankB) as CategoryId[]).filter((c) => bankB[c] !== undefined && !kitTypes.includes(c));
  const bassKeys: PlanKey[] = kitTypes.includes("bass") || bankBTypes.includes("bass") ? [] : ["bass", "808"];
  const restTypes = [...queues.keys()].filter((k) => !kitTypes.includes(k as CategoryId) && !bankBTypes.includes(k as CategoryId) && !bassKeys.includes(k));
  const planned = new Set<PlanKey>([...kitTypes, ...bankBTypes, ...bassKeys, ...restTypes]);
  const altsFor = (k: PlanKey) => Math.max(0, (kitTypes.includes(k as CategoryId) ? alternatives : otherAlternatives) - (have[k] ?? 0));

  const visibleWant = new Map<PlanKey, number>();
  for (const c of kitTypes) visibleWant.set(c, Math.min(kitSlots[c]!, available(c)));
  for (const c of bankBTypes) visibleWant.set(c, Math.min(bankB[c]!, available(c)));
  if (bassKeys.length) {
    // Two basses and two 808s; when there are too few of one kind the other makes up the four.
    let w808 = Math.min(pads808, available("808"));
    let wBass = Math.min(bassPads, available("bass"));
    const extra808 = Math.min(bassPads + pads808 - w808 - wBass, available("808") - w808);
    w808 += extra808;
    wBass += Math.min(bassPads + pads808 - w808 - wBass, available("bass") - wBass);
    visibleWant.set("808", w808);
    visibleWant.set("bass", wBass);
  }
  // The rest of bank C is shared evenly (a type with fewer files gives its share to the others). The alternatives are
  // set aside first, so a small type keeps some spares to swap in rather than putting every file on a pad.
  const forPads = (k: PlanKey) => Math.max(1, available(k) - altsFor(k));
  const share = new Map(restTypes.map((k) => [k, 0]));
  let room = restPads;
  for (let open = restTypes.filter((k) => available(k) > 0); room > 0 && open.length; ) {
    for (const k of shuffled(open, random)) {
      if (room <= 0) break;
      share.set(k, share.get(k)! + 1);
      room--;
    }
    open = open.filter((k) => share.get(k)! < forPads(k));
  }
  for (const [k, n] of share) visibleWant.set(k, n);

  const visible: PickedSound<T>[] = [];
  const hidden: PickedSound<T>[] = [];
  const shown = new Map<PlanKey, number>();
  const kept = new Map<PlanKey, number>();
  let bytes = 0;
  /** Takes the next file of a type that fits the budget, or null. */
  const pop = (key: PlanKey): PackFile<T> | null => {
    const q = queues.get(key);
    while (q?.length && bytes + q[q.length - 1].size > byteBudget) {
      q.pop();
      skippedForSize++;
    }
    const file = q?.pop() ?? null;
    if (file) bytes += file.size;
    return file;
  };

  for (const tier of BUDGET_TIERS) {
    const types = (tier === "kit" ? kitTypes : tier).filter((k) => queues.has(k) && planned.has(k) && (tier === "kit" || !kitTypes.includes(k as CategoryId)));
    for (let progressed = true; progressed; ) {
      progressed = false;
      for (const key of shuffled(types, random)) {
        const isShown = (shown.get(key) ?? 0) < (visibleWant.get(key) ?? 0);
        if (!isShown && (kept.get(key) ?? 0) >= altsFor(key)) continue;
        const file = pop(key);
        if (!file) continue;
        progressed = true;
        const sound: PickedSound<T> = { file, category: categoryOfKey(key), ...(key === "808" ? { is808: true } : {}) };
        if (isShown) {
          visible.push(sound);
          shown.set(key, (shown.get(key) ?? 0) + 1);
        } else {
          hidden.push(sound);
          kept.set(key, (kept.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const counts: PackPlan<T>["counts"] = {};
  const picked = (c: CategoryId) => (shown.get(c) ?? 0) + (kept.get(c) ?? 0) + (c === "bass" ? (shown.get("808") ?? 0) + (kept.get("808") ?? 0) : 0);
  for (const [category, n] of found) counts[category] = { found: n, picked: picked(category) };
  return { visible: shuffled(visible, random), hidden, counts, skippedForSize, skippedMelodicNames, totalFiles: files.length };
}
