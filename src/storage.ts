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
  /** The file a loader's sound came from (see Pad.sourceName). */
  sourceName?: string;
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
  toneOn?: boolean;
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

let persistAsked = false;

/**
 * Asks the browser to keep this app's data (the saved project, in IndexedDB) rather than clear it when the device is short of space. It is a request,
 * not a promise: iOS decides, and a granted request lasts. Asked once per visit, at start-up and again when a project is first saved.
 */
export async function askPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    if (persistAsked) return false;
    persistAsked = true;
    return await navigator.storage.persist();
  } catch {
    return false;
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
  void askPersistentStorage();
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
