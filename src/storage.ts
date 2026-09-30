// Remembers the app between visits: small settings in localStorage, the project file itself
// in IndexedDB (it's too big for localStorage). Every read/write is best-effort.
import type { CategoryId } from "./audio/classify";

const STATE_KEY = "tune-god:state";
const DB_NAME = "tune-god";
const STORE = "project";

export interface SavedPad {
  tune: boolean;
  tuneLocked?: boolean;
  semis: number;
  cents: number;
  category?: CategoryId;
  /** Where the sound sits now, if the user moved it. Pads are keyed by their original slot. */
  position?: number;
  /** The user deleted this sound (it is left out of the export). */
  deleted?: boolean;
}

export interface SavedState {
  normalize?: boolean;
  spread?: boolean;
  autoColor?: boolean;
  routeBuses?: boolean;
  paletteId?: string;
  toneOn?: boolean;
  /** A4 reference pitch in Hz (440 = standard). */
  a4?: number;
  bank?: number;
  selected?: number | null;
  keyPc?: number | null;
  tunedTarget?: number | null;
  pads?: Record<number, SavedPad>;
  /** Finger-drumming layout chosen in the menu (kept across projects). */
  layoutId?: string;
  /** This project is currently arranged with that layout. */
  layoutOn?: boolean;
  /** Where every sound sat before the layout was applied (original slot -> slot), so unchecking can restore it. */
  layoutPre?: Record<number, number>;
  /** The silent pads the layout added, recreated when the project reopens. */
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
