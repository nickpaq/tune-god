// Reading a sample pack folder: the audio files in it (see packProject.ts), the sound type a folder name implies, and the
// memory budget a project may use. What each bank takes from a folder is in bankLoad.ts. All of this works on file names
// and sizes only; no audio is read until a file has been picked.
import { classifyByName, hatOpenness, type CategoryId } from "./classify";

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
  ["other", /\b(other|misc|miscellaneous|uncategorized)\b/],
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
  if (!name || (GENERIC_FOLDER.test(name) && name !== "808" && !/^(misc|miscellaneous|uncategorized|other)$/i.test(name))) return null;
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
    if (tidy(folders[i]) === "other" || /^(misc|miscellaneous|uncategorized|other)$/i.test(tidy(folders[i]))) continue;
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

/** Fisher-Yates shuffle into a new array. `random` is injectable so tests are repeatable. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
