import { recordDebug } from "./diagnostics";
// Remembers the app between visits: small settings in localStorage, the project file itself
// in IndexedDB (it's too big for localStorage). Every read/write is best-effort.
import { reclassifyLibrary, type LibraryIndex } from "./audio/libraryIndex";
import type { PadPlayback } from "./audio/padSettings";
import { normalizeClassification, type SampleClassification } from "./audio/sampleClassification";
import { migrateCategory, type CategoryId } from "./audio/classify";

const STATE_KEY = "tune-god:state";
const DB_NAME = "tune-god";
const STORE = "project";
const SAMPLE_LIBRARY_STORE = "sample-library";

/** Favorites keep their audio on the device, one sound at a time (never batches): as many as fit in this many bytes (1 GB), with no limit on the count. */
export const MAX_FAVORITE_BYTES = 1024 * 1024 * 1024;

export interface SampleLibraryRecord {
  id: string;
  name: string;
  pack: string;
  sourcePath?: string;
  category: CategoryId;
  is808?: boolean;
  importedAt: number;
  favorite: boolean;
  /** Audio is kept only for favorites, so imported logs do not duplicate all sample data on-device. */
  audio?: Blob;
  sampleRate?: number;
}

export interface SavedPad {
  label?: string;
  tune: boolean;
  tuneLocked?: boolean;
  /** A key set for this pad alone ("Tune one"). */
  keyPc?: number;
  semis: number;
  cents: number;
  category?: CategoryId;
  classification?: SampleClassification;
  playback?: PadPlayback;
  /** A bass sound that is an 808 (see Pad.is808). */
  is808?: boolean;
  libraryId?: string;
  favorite?: boolean;
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
  libraryIndexId?: string;
  /** Project names already given to an export (see audio/projectName.ts), so a random name is not used twice. */
  usedProjectNames?: string[];
  /** The export check boxes (see audio/exportOptions.ts), remembered between exports. */
  exportOptions?: Partial<import("./audio/exportOptions").ExportOptions>;
  /** Types the user gave folder names (key: the normalised folder name), applied to every library. */
  folderTypes?: Record<string, CategoryId>;
  /** Display names of those folders, by key. */
  folderTypeNames?: Record<string, string>;
  kitPacks?: string[] | null;
  balancePacks?: boolean;
  loadHotSwapSpares?: boolean;
  typeSettings?: Partial<Record<CategoryId, PadPlayback>>;
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
  } catch (error) { recordDebug("Device storage", error);
    return {};
  }
}

/** Merges `patch` into whatever is stored. */
export function saveState(patch: SavedState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...loadState(), ...patch }));
  } catch (error) { recordDebug("Device storage", error);
    /* storage unavailable or full: the app just won't remember */
  }
}

/** The chop editor's markers are small, so they live in localStorage under the song they were placed on: closing the app or the editor loses nothing. */
const CHOP_KEY = "tune-god:chop:";

export interface SavedChopMarks {
  gridOffsetFrames?: number;
  chops: readonly number[];
  freeChops?: readonly number[];
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
    if (raw.gridOffsetFrames !== undefined && !Number.isFinite(raw.gridOffsetFrames)) return null;
    return raw as SavedChopMarks;
  } catch (error) { recordDebug("Device storage", error);
    return null;
  }
}

export function saveChopMarks(songKey: string, marks: SavedChopMarks): void {
  try {
    localStorage.setItem(CHOP_KEY + songKey, JSON.stringify(marks));
  } catch (error) { recordDebug("Device storage", error);
    /* storage unavailable or full: the markers just won't be remembered */
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("library-index")) req.result.createObjectStore("library-index", { keyPath: "id" });
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains(SAMPLE_LIBRARY_STORE)) req.result.createObjectStore(SAMPLE_LIBRARY_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist saved favorites; importing a pack must not create audio-less device records. */
export async function recordImportedSamples(records: SampleLibraryRecord[]): Promise<void> {
  if (!records.length) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAMPLE_LIBRARY_STORE, "readwrite");
      const store = tx.objectStore(SAMPLE_LIBRARY_STORE);
      for (const record of records) {
        const req = store.get(record.id);
        req.onsuccess = () => {
          const old = req.result as SampleLibraryRecord | undefined;
          if (old?.favorite) store.put({ ...record, favorite: true, audio: record.audio ?? old.audio, sampleRate: record.sampleRate ?? old.sampleRate });
          else if (record.favorite && record.audio) store.put(record);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) { recordDebug("Device storage", error);
    /* Device storage may be unavailable or full; the project import remains usable. */
  }
}

/** Remove legacy non-favorite import logs and expose only favorites with locally stored audio. */
export async function loadSampleLibrary(): Promise<SampleLibraryRecord[]> {
  try {
    const db = await openDb();
    const records = await new Promise<SampleLibraryRecord[]>((resolve, reject) => {
      const tx = db.transaction(SAMPLE_LIBRARY_STORE, "readwrite");
      const store = tx.objectStore(SAMPLE_LIBRARY_STORE);
      const req = store.getAll();
      let favorites: SampleLibraryRecord[] = [];
      req.onsuccess = () => {
        const all = req.result as SampleLibraryRecord[];
        for (const record of all) if (!record.favorite) store.delete(record.id);
        favorites = all.filter((record) => record.favorite && record.audio).map((record) => ({ ...record, category: migrateCategory(record.category) })).sort((a, b) => b.importedAt - a.importedAt);
      };
      tx.oncomplete = () => resolve(favorites);
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return records;
  } catch (error) { recordDebug("Device storage", error);
    return [];
  }
}

/** Pin or unpin one sound; audio is retained only while it is a favorite. */
export async function setSampleFavorite(id: string, favorite: boolean, audio?: Blob, sampleRate?: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAMPLE_LIBRARY_STORE, "readwrite");
      const store = tx.objectStore(SAMPLE_LIBRARY_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const old = req.result as SampleLibraryRecord | undefined;
        if (!old) return;
        if (!favorite) store.delete(id);
        else store.put({ ...old, favorite, ...(audio ? { audio, sampleRate } : {}) });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) { recordDebug("Device storage", error);
    /* Favorites are best-effort if the device has no storage quota left. */
  }
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
  } catch (error) { recordDebug("Device storage", error);
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
  } catch (error) { recordDebug("Device storage", error);
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
  } catch (error) { recordDebug("Device storage", error);
    /* ignore */
  }
}

/** Metadata only: no whole-library audio or file handles are persisted. */
export async function saveLibraryIndex(index: LibraryIndex): Promise<boolean> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("library-index", "readwrite");
        tx.objectStore("library-index").put(index);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      return true;
    } finally { db.close(); }
  } catch (error) { recordDebug("Device storage", error); return false; }
}
export async function loadLibraryIndex(id: string): Promise<LibraryIndex | null> {
  try {
    const db = await openDb();
    try {
      return await new Promise<LibraryIndex | null>((resolve, reject) => {
        const req = db.transaction("library-index").objectStore("library-index").get(id);
        req.onsuccess = () => {
          const index = req.result as LibraryIndex | undefined;
          const loaded = index ? reclassifyLibrary({ ...index, samples: index.samples.map((sample) => ({ ...sample, classification: normalizeClassification(sample.classification), correction: sample.correction ? normalizeClassification(sample.correction) : undefined })) }) : null;
          // The index is written back only when loading upgraded it (new classification rules); an unchanged library is never rewritten.
          if (index && loaded && loaded.classificationVersion !== index.classificationVersion) void saveLibraryIndex(loaded);
          resolve(loaded);
        }; req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  } catch (error) { recordDebug("Device storage", error); return null; }
}
