// Browser side of the sample pack import: walks a dropped folder (or a folder chosen with the file
// picker) without reading any audio, then packs the chosen sounds into an ordinary .koala project
// so the rest of the app loads, analyses and exports it like any other project.
import JSZip from "jszip";
import { decodeNative } from "./decode";
import { encodeWav } from "./wavEncode";
import type { CategoryId } from "./classify";
import { applyGainDb } from "./gain";
import { balanceFromStats, balanceStats, FILE_CEILING_DB, type BalanceInput, type BalanceStats } from "./loudness";
import { AUDIO_EXTENSIONS, planPackSounds, type PackFile, type PackPlan } from "./samplePack";

/** A dropped file the pack can read later. */
export type PackSource = () => Promise<File>;

export interface FoundPack {
  name: string;
  files: PackFile<PackSource>[];
}

type Entry = FileSystemEntry;

/** True when a drop holds a folder, so the app can tell a pack from a single .koala file. */
export function dropHasFolder(items: DataTransferItemList | undefined): boolean {
  return Array.from(items ?? []).some((item) => item.kind === "file" && item.webkitGetAsEntry?.()?.isDirectory);
}

/**
 * Entries must be taken from the drop event synchronously (the list is emptied once the handler yields),
 * so this is called straight from the handler and the walking happens afterwards.
 */
export function entriesOfDrop(items: DataTransferItemList): Entry[] {
  const out: Entry[] = [];
  for (const item of Array.from(items)) {
    const entry = item.kind === "file" ? item.webkitGetAsEntry?.() : null;
    if (entry) out.push(entry);
  }
  return out;
}

function readAll(reader: FileSystemDirectoryReader): Promise<Entry[]> {
  // readEntries hands back a batch at a time (about 100) until it returns an empty one.
  return new Promise((resolve, reject) => {
    const all: Entry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

async function walk(entry: Entry, folders: string[], out: PackFile<PackSource>[]): Promise<void> {
  if (entry.name.startsWith(".")) return; // .DS_Store, __MACOSX and friends
  if (entry.isDirectory) {
    if (entry.name === "__MACOSX") return;
    const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walk(child, [...folders, entry.name], out);
    return;
  }
  if (!AUDIO_EXTENSIONS.test(entry.name)) return;
  // Taking the File only gets a handle with its size; no bytes are read yet.
  const file = await fileOf(entry as FileSystemFileEntry);
  out.push({ folders, name: entry.name, size: file.size, source: async () => file });
}

/** The audio files under dropped entries. One dropped folder is the pack and its name is the project's (it is not used to classify); several are all folders of one pack. */
export async function findPackInEntries(entries: Entry[]): Promise<FoundPack> {
  const files: PackFile<PackSource>[] = [];
  const root = entries.length === 1 && entries[0].isDirectory ? (entries[0] as FileSystemDirectoryEntry) : null;
  if (root) {
    for (const child of await readAll(root.createReader())) await walk(child, [], files);
  } else {
    for (const entry of entries) await walk(entry, [], files);
  }
  return { name: root?.name ?? "Sample pack", files };
}

/** The same for a folder picked with `<input webkitdirectory>`, whose files carry their relative paths. */
export function findPackInFileList(list: FileList | File[]): FoundPack {
  const files: PackFile<PackSource>[] = [];
  let name = "Sample pack";
  for (const file of Array.from(list)) {
    const parts = (file.webkitRelativePath || file.name).split("/");
    if (parts.length > 1) name = parts[0];
    const folders = parts.slice(1, -1);
    if (parts.some((p) => p.startsWith(".") || p === "__MACOSX") || !AUDIO_EXTENSIONS.test(file.name)) continue;
    files.push({ folders, name: file.name, size: file.size, source: async () => file });
  }
  return { name, files };
}

export interface PackProject {
  file: File;
  /** The chosen type of each sound, by pad number, so the classifier keeps it. */
  categories: Record<number, CategoryId>;
  /** The volume knob level (dB) written for each pad; the loudness gain itself is already in the audio. */
  knobDb: Record<number, number>;
  /** Pads (by number) that hold an 808 rather than an ordinary bass. */
  is808: Record<number, true>;
  plan: PackPlan<PackSource>;
}

/** Pads numbered from here up hold hidden hot-swap alternatives: past the 64 pads of the grid, so never on one. */
export const HIDDEN_PAD_BASE = 64;

export interface BuildOptions {
  /** How many sounds of each type the finger-drumming page has slots for (see kitSlotCounts). */
  kitSlots: Partial<Record<CategoryId, number>>;
  byteBudget?: number;
  random?: () => number;
  /** Where loudness is measured (a worker in the app, so long loops don't stall the screen). */
  measure?: (input: BalanceInput) => Promise<BalanceStats>;
  /** Called as the sounds are processed ("Measuring 3/40"). */
  onProgress?: (text: string) => void;
}

/** Pad knob value for a dB level: plain linear amplitude, as Koala's knob is. */
const volFromDb = (db: number) => 10 ** (db / 20);

/**
 * Picks the sounds and zips them into a Koala project, reading one file at a time so only the chosen
 * sounds are ever in memory. Plain WAVs go in byte for byte; any other format is decoded and written as a 24-bit WAV.
 * Returns null when the pack held no usable audio.
 */
export async function buildPackProject(pack: FoundPack, options: BuildOptions): Promise<PackProject | null> {
  const { measure = async (input: BalanceInput) => balanceStats(input), onProgress } = options;
  const plan = planPackSounds(pack.files, options);
  const picked = [...plan.visible.map((sound) => ({ sound, hidden: false })), ...plan.hidden.map((sound) => ({ sound, hidden: true }))];
  if (!plan.visible.length) return null;

  // Pass 1: measure every picked sound, one at a time, keeping only its loudness and peak. The balance
  // (a common loudness with a peak ceiling) needs the whole set, so nothing can be written before this ends.
  const readable: typeof picked = [];
  const stats: BalanceStats[] = [];
  for (const item of picked) {
    onProgress?.(`Measuring ${readable.length + 1}/${picked.length}`);
    try {
      const decoded = await decodeNative(await item.sound.file.source());
      stats.push(await measure({ channelData: decoded.channelData, sampleRate: decoded.sampleRate, category: item.sound.category }));
      readable.push(item);
    } catch (err) {
      // An unreadable file just leaves its pad empty.
      console.error(err);
    }
  }
  if (!readable.some((r) => !r.hidden)) return null;
  const balance = balanceFromStats(stats, FILE_CEILING_DB);

  // Pass 2: decode again, bake in the gain and write the 24-bit WAV. Only the processed sound goes into the
  // project, so there is no untouched copy to keep for undo, and the knob carries the per-type mix.
  const zip = new JSZip();
  const samples: unknown[] = [];
  const pads: unknown[] = [];
  const categories: Record<number, CategoryId> = {};
  const knobDb: Record<number, number> = {};
  const is808: Record<number, true> = {};
  let shownCount = 0;
  let hiddenCount = 0;
  for (let n = 0; n < readable.length; n++) {
    const { sound: { file, category, is808: eight08 }, hidden } = readable[n];
    // Sounds for pads take pad numbers 0 up; hot-swap alternatives are numbered from 64, off the grid.
    const slot = hidden ? HIDDEN_PAD_BASE + hiddenCount++ : shownCount++;
    onProgress?.(`Levelling ${n + 1}/${readable.length}`);
    const decoded = await decodeNative(await file.source());
    const channelData = applyGainDb(decoded.channelData, balance.gainDb[n]);
    const frames = channelData[0].length;
    const id = n + 1;
    zip.file(`sampler/${id}.wav`, await encodeWav({ sampleRate: decoded.sampleRate, channelData, bitDepth: 24 }).arrayBuffer());
    samples.push({ id, metadata: { originalPath: file.name } });
    pads.push({ pad: slot, type: "sample", sampleId: id, vol: volFromDb(balance.knobDb[n]), pan: 0.5, pitch: 0, start: 0, end: frames, zoomStart: 0, zoomEnd: frames });
    categories[slot] = category;
    knobDb[slot] = balance.knobDb[n];
    if (eight08) is808[slot] = true;
  }

  zip.file("sampler/sampler.json", JSON.stringify({ samples, pads }));
  // Audio is already compressed or dense PCM; storing it skips a slow pass over every byte.
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true });
  return { file: new File([blob], `${pack.name}.koala`, { type: "application/octet-stream" }), categories, knobDb, is808, plan };
}
