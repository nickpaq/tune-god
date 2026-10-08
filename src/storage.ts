// Remembers the app between visits: small settings in localStorage, the project file itself
// in IndexedDB (it's too big for localStorage). Every read/write is best-effort.
import type { CategoryId } from "./audio/classify";

const STATE_KEY = "tune-god:state";
const DB_NAME = "tune-god";
const STORE = "project";

export interface SavedPad {
  tune: boolean;
  tuneLocked?: boolean;
  /** A key set for this pad alone ("Tune one"). */
  keyPc?: number;
  semis: number;
  cents: number;
  category?: CategoryId;
  /** A bass sound that is an 808 (see Pad.is808). */
  is808?: boolean;
  /** The Tune screen's Stretch key was on for this loop (see Pad.stretch). */
  stretch?: boolean;
  /** The pad is locked (see Pad.locked). */
  locked?: boolean;
  /** Knob level of a sample pack sound (see Pad.knobDb). */
  knobDb?: number;
  /** Where the sound sits now, if the user moved it. Pads are keyed by their original slot. */
  position?: number;
  /** The sound sits in the hot-swap menu rather than on a pad (a sample pack's spare options). */
  hidden?: boolean;
  /** The user deleted this sound (it is left out of the export). */
  deleted?: boolean;
}

export interface SavedState {
  /** The menu's Organize switch: levels, bus routing, settings by sound type, the melodic spread and the master chain. */
  organizeOn?: boolean;
  /** The menu's Sidechain switch (bass and 808 duck to the kick). */
  sidechainOn?: boolean;
  /** Older versions' Mix switch, read once to carry the setting over to Organize and Sidechain. */
  mix?: boolean;
  /** Which master chain the Master chain switch writes. */
  masterStyle?: "dynamic" | "loud";
  normalize?: boolean;
  spread?: boolean;
  autoColor?: boolean;
  routeBuses?: boolean;
  masterChain?: boolean;
  /** The Master chain switch (a newer key than `masterChain`, which an earlier version defaulted to on). */
  masterChainOn?: boolean;
  autoPlayback?: boolean;
  /** Show a grey sound-type symbol on each pad. */
  padSymbols?: boolean;
  /** How much of a dropped sample pack to load: "auto" guesses from the device. */
  packMemory?: "low" | "auto" | "high";
  paletteId?: string;
  /** The app icon's look: the light version (white, no border) instead of the dark one. */
  iconLight?: boolean;
  toneOn?: boolean;
  /** The reference tone's volume knob, 0 to 1 (0.5 is the level matched to the sound). */
  toneVolume?: number;
  /** A4 reference pitch in Hz (440 = standard). */
  a4?: number;
  bank?: number;
  selected?: number | null;
  keyPc?: number | null;
  tunedTarget?: number | null;
  /** The key picked on the piano is a major key (the Tune screen's switch); the default is a minor key. */
  keyMajor?: boolean;
  /** The project tempo (the menu's BPM). */
  bpm?: number;
  pads?: Record<number, SavedPad>;
  /** Finger-drumming layout chosen in the menu (kept across projects). */
  layoutId?: string;
  /** This project is currently arranged with that layout. */
  layoutOn?: boolean;
  /** Where every sound sat before the layout was applied (original slot -> slot), so unchecking can restore it. */
  layoutPre?: Record<number, number>;
  /** The silent pads the layout added, recreated when the project reopens. */
  /** The ghost snare and soft kick pads the layout added, recreated from their source sounds when the project reopens. */
  layoutGhosts?: { index: number; kind: "ghostSnare" | "softKick"; sourceOrigIndex: number }[];
  layoutPlaceholders?: { index: number; kind: "missing" | "empty"; label: string }[];
}

export function loadState(): SavedState {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") as SavedState;
  } catch {
    return {};
  }
}

/** Merges `patch` into whatever is stored. */
export function saveState(patch: SavedState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...loadState(), ...patch }));
  } catch {
    /* storage unavailable or full: the app just won't remember */
  }
}

/** The chop editor's markers are small, so they live in localStorage under the song they were placed on: closing the app or the editor loses nothing. */
const CHOP_KEY = "tune-god:chop:";

export interface SavedChopMarks {
  chops: readonly number[];
  downbeats: readonly number[];
  oneOne: number | null;
  tempoScale: number;
  bpm?: number | null;
}

export function loadChopMarks(songKey: string): SavedChopMarks | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CHOP_KEY + songKey) ?? "null");
    const numbers = (v: unknown) => Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isFinite(n));
    if (!raw || !numbers(raw.chops) || !numbers(raw.downbeats) || !(raw.oneOne === null || Number.isFinite(raw.oneOne)) || !(raw.tempoScale > 0)) return null;
    return raw as SavedChopMarks;
  } catch {
    return null;
  }
}

export function saveChopMarks(songKey: string, marks: SavedChopMarks): void {
  try {
    localStorage.setItem(CHOP_KEY + songKey, JSON.stringify(marks));
  } catch {
    /* storage unavailable or full: the markers just won't be remembered */
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProjectFile(file: File): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(file, "file");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function loadProjectFile(): Promise<File | null> {
  try {
    const db = await openDb();
    const file = await new Promise<File | null>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get("file");
      req.onsuccess = () => resolve((req.result as File | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return file;
  } catch {
    return null;
  }
}

export async function clearProjectFile(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete("file");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
