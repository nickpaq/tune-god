// Turns a dropped sample pack (a folder tree of audio files) into the sounds for a Koala project:
// each file is classified from its folder names, then up to one pad bank's worth are picked so every
// sound type is as evenly represented as the pack allows, within a memory budget. All of this works on
// file names and sizes only; no audio is read until a file has been picked.
import { classifyByName, type CategoryId } from "./classify";

/** Pads in a Koala project (four banks of sixteen). */
export const PACK_SLOTS = 64;
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
  ["fx", /\b(fx|sfx|effects?|risers?|sweeps?|impacts?|whooshe?s?|transitions?|downlifters?|uplifters?|noises?|glitch(es)?|foley|textures?|swells?|ambien(ce|t)s?|atmos(pheres?)?|drones?|FX|booms?)\b/],
  ["perc", /\b(toms?|perc|percs|percussions?|congas?|bongos?|tamb(ourines?)?|cowbells?|claves?|wood ?blocks?|timpani|shakers?|cabasas?|guiros?)\b/],
  ["bass", /\b(808s?|bass(es)?|subs?|reese)\b/],
  ["melodic", /\b(pianos?|keys?|keyboards?|bells?|plucks?|guitars?|harps?|mallets?|marimbas?|kalimbas?|rhodes|epianos?|stabs?|vibraphones?|glock(enspiel)?s?|celestas?|chimes?|pads?|synths?|leads?|chords?|strings?|organs?|brass|horns?|flutes?|melod(y|ic|ies)|instruments?|tonal)\b/],
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
      return hat === "openHat" || hat === "cymbal" ? hat : "closedHat";
    }
    if (byFolder) return byFolder;
  }
  const byName = classifyByName(fileName);
  if (byName === "hat") return "closedHat";
  return byName ?? "other";
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
}

export interface PackSelection<T = unknown> {
  /** In pad order: shuffled, so the sound types are scattered across the pads. */
  picked: PickedSound<T>[];
  /** How many files the pack held in each type, and how many of those were picked. */
  counts: Partial<Record<CategoryId, { found: number; picked: number }>>;
  /** Audio files left out because they were too large to load, or because the byte budget ran out. */
  skippedForSize: number;
  totalFiles: number;
}

/**
 * Picks the sounds for the pads. Types take turns, one file each in a freshly shuffled order every round, so the counts
 * differ by at most one and a type with few files simply drops out while the others carry on. Files within a type
 * are random. A file that would push the total past `byteBudget` (or is over `maxFileBytes`) is passed over for the
 * next one of its type, which favours smaller files only as the budget runs out.
 */
export function selectPackSounds<T>(
  files: PackFile<T>[],
  {
    slots = PACK_SLOTS,
    byteBudget = PACK_BYTE_BUDGET,
    maxFileBytes = maxFileBytesFor(byteBudget),
    random = Math.random,
  }: { slots?: number; byteBudget?: number; maxFileBytes?: number; random?: () => number } = {},
): PackSelection<T> {
  const queues = new Map<CategoryId, PackFile<T>[]>();
  const found = new Map<CategoryId, number>();
  let skippedForSize = 0;
  for (const file of files) {
    const category = categoryOfFile(file.folders, file.name);
    found.set(category, (found.get(category) ?? 0) + 1);
    if (file.size > maxFileBytes || file.size <= 0) {
      skippedForSize += file.size > 0 ? 1 : 0;
      continue;
    }
    const q = queues.get(category) ?? [];
    q.push(file);
    queues.set(category, q);
  }
  for (const [category, q] of queues) queues.set(category, shuffled(q, random));

  const picked: PickedSound<T>[] = [];
  const pickedBy = new Map<CategoryId, number>();
  let bytes = 0;
  while (picked.length < slots) {
    let tookAny = false;
    for (const category of shuffled([...queues.keys()], random)) {
      if (picked.length >= slots) break;
      const q = queues.get(category)!;
      // Skip over files that no longer fit; they stay skipped.
      while (q.length && bytes + q[q.length - 1].size > byteBudget) {
        q.pop();
        skippedForSize++;
      }
      const file = q.pop();
      if (!file) continue;
      bytes += file.size;
      picked.push({ file, category });
      pickedBy.set(category, (pickedBy.get(category) ?? 0) + 1);
      tookAny = true;
    }
    if (!tookAny) break;
  }

  const counts: PackSelection<T>["counts"] = {};
  for (const [category, n] of found) counts[category] = { found: n, picked: pickedBy.get(category) ?? 0 };
  return { picked: shuffled(picked, random), counts, skippedForSize, totalFiles: files.length };
}
