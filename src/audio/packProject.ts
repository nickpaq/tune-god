// Browser side of the sample pack import: walks a dropped folder (or a folder chosen with the file
// picker) without reading any audio, then packs the chosen sounds into an ordinary .koala project
// so the rest of the app loads, analyses and exports it like any other project.
import JSZip from "jszip";
import { decodeNative } from "./decode";
import { encodeWav } from "./wavEncode";
import type { CategoryId } from "./classify";
import { AUDIO_EXTENSIONS, selectPackSounds, type PackFile, type PackSelection } from "./samplePack";

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
  selection: PackSelection<PackSource>;
}

/**
 * Picks the sounds and zips them into a Koala project, reading one file at a time so only the chosen
 * sounds are ever in memory. Plain WAVs go in byte for byte; any other format is decoded and written as a 24-bit WAV.
 * Returns null when the pack held no usable audio.
 */
export async function buildPackProject(pack: FoundPack, random?: () => number): Promise<PackProject | null> {
  const selection = selectPackSounds(pack.files, { random });
  if (!selection.picked.length) return null;

  const zip = new JSZip();
  const samples: unknown[] = [];
  const pads: unknown[] = [];
  const categories: Record<number, CategoryId> = {};
  let slot = 0;
  for (const { file, category } of selection.picked) {
    let blob: Blob;
    let frames: number;
    try {
      const source = await file.source();
      const decoded = await decodeNative(source);
      frames = decoded.channelData[0].length;
      blob = /\.wave?$/i.test(file.name) ? source : encodeWav({ sampleRate: decoded.sampleRate, channelData: decoded.channelData, bitDepth: 24 });
    } catch (err) {
      // An unreadable file just leaves its pad empty.
      console.error(err);
      continue;
    }
    const id = slot + 1;
    zip.file(`sampler/${id}.wav`, await blob.arrayBuffer());
    samples.push({ id, metadata: { originalPath: file.name } });
    pads.push({ pad: slot, type: "sample", sampleId: id, vol: 1, pan: 0.5, pitch: 0, start: 0, end: frames, zoomStart: 0, zoomEnd: frames });
    categories[slot] = category;
    slot++;
  }
  if (!slot) return null;

  zip.file("sampler/sampler.json", JSON.stringify({ samples, pads }));
  // Audio is already compressed or dense PCM; storing it skips a slow pass over every byte.
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true });
  return { file: new File([blob], `${pack.name}.koala`, { type: "application/octet-stream" }), categories, selection };
}
