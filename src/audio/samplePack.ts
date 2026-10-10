// Reading a sample pack folder: the audio files in it (see packProject.ts), the sound type a folder name implies, and the
// memory budget a project may use. What each bank takes from a folder is in bankLoad.ts. All of this works on file names
// and sizes only; no audio is read until a file has been picked.
import type { CategoryId } from "./classify";

const MB = 1024 * 1024;
/** Total file size of the sounds a project may hold: the default limit. Decoded audio takes about three times this in memory. */
export const PROJECT_BYTE_BUDGET = 512 * MB;
const LOW_BYTE_BUDGET = 96 * MB;
const HIGH_BYTE_BUDGET = 1024 * MB;

/** The menu's choice of the project size limit. */
export type PackMemory = "low" | "auto" | "high";

/** How many bytes of sound files a project may hold: 512 MB unless the menu says Low (96 MB) or High (1 GB). */
export function packByteBudget(setting: PackMemory): number {
  if (setting === "low") return LOW_BYTE_BUDGET;
  return setting === "high" ? HIGH_BYTE_BUDGET : PROJECT_BYTE_BUDGET;
}

/** The biggest single file a budget allows: no one sample may swallow more than a sixth of it. */
export const maxFileBytesFor = (byteBudget: number) => Math.round(byteBudget / 6);

/** One audio file found in the pack: where it sits (folder names, outermost first) and how big it is. */
export interface PackFile<T = unknown> {
  folders: string[];
  /** Selected root, retained separately so flat bank loaders can still reject subfolders. */
  rootFolder?: string;
  name: string;
  size: number;
  /** Whatever the caller needs to read the file later. */
  source: T;
  /** Stable identity from the on-device sample library, when this is a saved favorite. */
  libraryId?: string;
  /** Favorite sounds are always retained as hot-swap choices, never chosen as part of a new kit. */
  favorite?: boolean;
  /** Original pack labels are kept when a saved favorite is re-imported. */
  sourceName?: string;
  sourcePath?: string;
  sourcePack?: string;
}

/** Top-level pack identity inside a selected folder; type folders themselves are not treated as separate packs. */
export function sourcePackOf<T>(file: PackFile<T>): string {
  const typedAt = file.folders.findIndex((folder) => categoryOfFolder(folder) !== null || /^(one ?shots?|shots?)$/i.test(folder));
  const parent = typedAt >= 0 ? file.folders.slice(0, typedAt) : file.folders.slice(0, 1);
  return parent.join("/") || "(selected folder)";
}

/** Randomizes within each source pack, then alternates packs so a huge sub-pack cannot dominate the kit. */
export function fairPackOrder<T>(files: PackFile<T>[], random: () => number = Math.random): PackFile<T>[] {
  const packs = new Map<string, PackFile<T>[]>();
  for (const file of files) {
    const key = sourcePackOf(file);
    const pack = packs.get(key);
    if (pack) pack.push(file);
    else packs.set(key, [file]);
  }
  const rows = shuffled([...packs.values()].map((pack) => shuffled(pack, random)), random);
  const result: PackFile<T>[] = [];
  const longest = rows.reduce((max, row) => Math.max(max, row.length), 0);
  for (let i = 0; i < longest; i++) {
    for (const row of rows) {
      if (i < row.length) result.push(row[i]);
    }
  }
  return result;
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
  // Percussion folders take precedence over melodic keywords.
  ["perc", /\b(toms?|congas?|bongos?|tamb(ourines?)?|cowbells?|bells?|chimes?|glock(enspiel)?s?|claves?|wood ?blocks?|timpani|shakers?|cabasas?|guiros?)\b/],
  ["perc", /\b(perc|percs|percussions?)\b/],
  ["bass", /\b(808s?|bass(es)?|subs?|reese)\b/],
  ["melodic", /\b(pianos?|keys?|keyboards?|bells?|plucks?|guitars?|harps?|mallets?|marimbas?|kalimbas?|rhodes|epianos?|stabs?|vibraphones?|glock(enspiel)?s?|celestas?|chimes?|pads?|synths?|leads?|chords?|strings?|organs?|brass|horns?|flutes?|melod(y|ic|ies)|instruments?|tonal|pitched)\b/],
  ["other", /\b(other|misc|miscellaneous|uncategorized)\b/],
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
  if (!name || (GENERIC_FOLDER.test(name) && name !== "808" && !/^(misc|miscellaneous|uncategorized|other)$/i.test(name))) return null;
  const isLoop = /\bloops?\b/.test(name);
  for (const [id, re] of FOLDER_RULES) {
    if (!re.test(name)) continue;
    // Mixed hats folders use the same default for every file.
    if (id === "cymbal" && /\b(hi ?hats?|hats?|hh)\b/.test(name)) return "hat";
    if (!isLoop) return id;
    // A "loops" folder holds loops of its type.
    if (id === "perc" || id === "percLoop") return "percLoop";
    if (id === "bass" || id === "melodic" || id === "melodicLoop") return "melodicLoop";
    return "drumLoop";
  }
  // A bare Loops folder defaults to drum loops.
  return isLoop ? "drumLoop" : null;
}

/** The nearest typed folder is the only classification input. Unknown folders stay Other. */
export function categoryOfFile(folders: string[], _fileName: string): CategoryId {
  for (let i = folders.length - 1; i >= 0; i--) {
    const category = categoryOfFolder(folders[i]);
    if (category) return category === "hat" ? "closedHat" : category;
  }
  return "other";
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
