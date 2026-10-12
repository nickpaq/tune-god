// Browser side of the bank loaders: walks a dropped folder (or a folder chosen with the file picker) without reading
// any audio, then writes the chosen sounds into an ordinary .koala project so the rest of the app loads, analyses and
// exports them like any other sound.
import JSZip from "jszip";
import { decodeNative } from "./decode";
import { encodeWav } from "./wavEncode";
import type { SampleClassification } from "./sampleClassification";
import { is808Name, type CategoryId } from "./classify";
import { applyGainDb } from "./gain";
import { balanceFromStats, balanceStats, FILE_CEILING_DB, type BalanceInput, type BalanceStats } from "./loudness";
import type { ParsedKoalaProject } from "./koalaProject";
import { bankFileName, type BankGroup } from "./bankLoad";
import { AUDIO_EXTENSIONS, classifyFile, maxFileBytesFor, sourcePackOf, type PackFile } from "./samplePack";

/** A dropped file the pack can read later. */
export type PackSource = () => Promise<File>;

export interface FoundPack {
  name: string;
  files: PackFile<PackSource>[];
}

type Entry = FileSystemEntry;

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
  out.push({ folders, sourcePath: [...folders, entry.name].join("/"), name: entry.name, size: file.size, lastModified: file.lastModified, source: async () => file });
}

/** The audio files under dropped entries. One dropped folder is the pack; its name is retained for classification and source paths; several are all folders of one pack. */
export async function findPackInEntries(entries: Entry[]): Promise<FoundPack> {
  const files: PackFile<PackSource>[] = [];
  const root = entries.length === 1 && entries[0].isDirectory ? (entries[0] as FileSystemDirectoryEntry) : null;
  if (root) {
    for (const child of await readAll(root.createReader())) await walk(child, [root.name], files);
  } else {
    for (const entry of entries) await walk(entry, [], files);
  }
  if (root) for (const file of files) { file.folders = file.folders.slice(1); file.rootFolder = root.name; }
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
    files.push({ folders, rootFolder: parts.length > 1 ? parts[0] : undefined, sourcePath: parts.join("/"), name: file.name, size: file.size, lastModified: file.lastModified, source: async () => file });
  }
  return { name, files };
}

export async function findPackInFileListAsync(list: FileList | File[], onProgress: (processed: number, total: number) => void): Promise<FoundPack> {
  const files: PackFile<PackSource>[] = [];
  let name = "Sample pack";
  onProgress(0, list.length);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && i % 500 === 0) {
      onProgress(i, list.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const file = list[i];
    const parts = (file.webkitRelativePath || file.name).split("/");
    if (parts.length > 1) name = parts[0];
    const folders = parts.slice(1, -1);
    if (parts.some((p) => p.startsWith(".") || p === "__MACOSX") || !AUDIO_EXTENSIONS.test(file.name)) continue;
    files.push({ folders, rootFolder: parts.length > 1 ? parts[0] : undefined, sourcePath: parts.join("/"), name: file.name, size: file.size, lastModified: file.lastModified, source: async () => file });
  }
  return { name, files };
}

/** Pads numbered from here up hold hidden hot-swap alternatives: past the 64 pads of the grid, so never on one. */
export const HIDDEN_PAD_BASE = 64;

/** Pad knob value for a dB level: plain linear amplitude, as Koala's knob is. */
const volFromDb = (db: number) => 10 ** (db / 20);

/** One sound written to the project. */
export interface WrittenSound {
  classification?: SampleClassification;
  /** Its pad number in the project (past the grid; the export renumbers it if it ends up on a pad). */
  pad: number;
  sampleId: number;
  /** "Kick 1.wav": the name the sound was written under. */
  fileName: string;
  category: CategoryId;
  is808: boolean;
  knobDb: number;
  /** Which of the plan's groups it came from and its number there. */
  group: number;
  number: number;
  libraryId: string;
  sourceName: string;
  sourcePath: string;
  sourcePack: string;
  favorite: boolean;
}

export interface WriteResult {
  /** The project file with the new sounds in it, to keep for the next visit. */
  file: File;
  sounds: WrittenSound[];
  /** Files left out because they were too long, too big or unreadable. */
  skipped: number;
}

export interface WriteOptions {
  /** What is already in the project (that stays), measured so the new sounds sit at its loudness. */
  existing: BalanceInput[];
  byteBudget: number;
  /** Sounds longer than this are skipped. */
  maxSeconds?: number;
  /** Pad numbers of sounds the new ones replace: they are taken out of the project once the new sounds have been read. */
  replace?: number[];
  /** Where loudness is measured (a worker in the app, so long loops don't stall the screen). */
  measure?: (input: BalanceInput) => Promise<BalanceStats>;
  onProgress?: (text: string) => void;
  fillTo?: number;
  fallbackCandidates?: PackFile<PackSource>[];
  random?: () => number;
}

/** Conservative one-shot tails; loops have their own slots and duration budget. */
export const ONE_SHOT_MAX_SECONDS = { bass: 5, melodic: 6 } as const;
export function acceptsOneShotDuration(category: CategoryId, seconds: number): boolean {
  const limit = category === "bass" ? ONE_SHOT_MAX_SECONDS.bass : category === "melodic" ? ONE_SHOT_MAX_SECONDS.melodic : undefined;
  return Number.isFinite(seconds) && seconds > 0 && (limit === undefined || seconds <= limit);
}

/** Most files tried per sound wanted, so a folder full of over-long files does not get decoded end to end. */
const TRIES_PER_SOUND = 8;

/**
 * Pulls each group's sounds out of its files (skipping any that cannot be read, are over `maxSeconds`, or would pass the byte budget),
 * levels them against the sounds already in the project, and writes them into the project's zip and sampler.json under their numbered
 * names ("Kick 1.wav"). Files are read one at a time, so only the chosen sounds are ever in memory. Sounds already in the project are
 * not touched. Returns null when nothing could be taken.
 */
export async function writeBankSounds(project: ParsedKoalaProject, groups: BankGroup<PackSource>[], options: WriteOptions): Promise<WriteResult | null> {
  const { measure = async (input: BalanceInput) => balanceStats(input), onProgress, existing, byteBudget, maxSeconds, replace } = options;
  const maxFileBytes = maxFileBytesFor(Math.max(byteBudget, 1));
  groups = [...groups];
  const random = options.random ?? Math.random;

  // Existing sounds are measured first so the common loudness is the one the whole project is already at.
  const stats: BalanceStats[] = [];
  for (const [n, input] of existing.entries()) {
    onProgress?.(`Reading project ${n + 1}/${existing.length}`);
    stats.push(await measure(input));
  }

  // Pass 1: decode and measure the candidates, one at a time, until each group has what it wants.
  const taken: { file: PackFile<PackSource>; group: number; number: number }[] = [];
  let skipped = 0;
  let bytes = 0;
  const take = async (file: PackFile<PackSource>, g: number): Promise<boolean> => {
    const group = groups[g];
      if (file.size <= 0 || file.size > maxFileBytes || bytes + file.size > byteBudget) {
        skipped++;
        return false;
      }
      if (group.category === "bass" || group.category === "melodic") {
        const inferred = classifyFile([...(file.rootFolder ? [file.rootFolder] : []), ...file.folders], file.name);
        if (file.classification?.category === "bassLoop" || file.classification?.category === "melodicLoop" || inferred.category === "bassLoop" || inferred.category === "melodicLoop") {
          skipped++;
          return false;
        }
      }
      onProgress?.(`Measuring ${taken.length + 1}`);
      try {
        const decoded = await decodeNative(await file.source());
        if (!acceptsOneShotDuration(group.category, decoded.channelData[0].length / decoded.sampleRate) || (maxSeconds !== undefined && decoded.channelData[0].length / decoded.sampleRate > maxSeconds)) {
          skipped++;
          return false;
        }
        // Compressed source sizes do not bound the WAV/audio memory retained by the project.
        const retainedBytes = 44 + decoded.channelData.reduce((sum, channel) => sum + channel.length * 3, 0);
        if (retainedBytes > maxFileBytes || bytes + retainedBytes > byteBudget) {
          skipped++;
          return false;
        }
        stats.push(await measure({ channelData: decoded.channelData, sampleRate: decoded.sampleRate, category: group.category }));
        bytes += retainedBytes;
        taken.push({ file, group: g, number: taken.length + 1 });
        return true;
      } catch (err) {
        console.error(err);
        skipped++;
      }
    return false;
  };
  for (const [g, group] of groups.entries()) {
    let got = 0;
    let tries = 0;
    for (const file of group.candidates) {
      if (got >= group.want || tries >= group.want * TRIES_PER_SOUND) break;
      tries++;
      if (await take(file, g)) got++;
    }
  }
  // Try unused available Types after strict quotas, without decoding the whole library.
  const fillTo = options.fillTo ?? 0;
  const chosen = new Set(taken.map(({ file }) => file.libraryId ?? file.sourcePath ?? file.name));
  let fallbackTries = 0;
  const fallbackLimit = Math.max(0, fillTo - taken.length) * TRIES_PER_SOUND;
  for (const file of options.fallbackCandidates ?? []) {
    if (taken.length >= fillTo || fallbackTries >= fallbackLimit) break;
    const id = file.libraryId ?? file.sourcePath ?? file.name;
    if (chosen.has(id)) continue;
    fallbackTries++;
    const classification = file.classification ?? classifyFile([file.rootFolder ?? "", ...file.folders], file.name);
    let group = groups.findIndex(group => group.category === classification.category && !group.is808);
    if (group < 0) { group = groups.length; groups.push({ category: classification.category, candidates: [], want: 0 }); }
    if (await take({ ...file, classification }, group)) chosen.add(id);
  }
  if (!taken.length) return null;
  const balance = balanceFromStats(stats, FILE_CEILING_DB);
  if (replace?.length) await removeFromProject(project, replace);

  // Pass 2: decode again, bake in the gain and write the 24-bit WAV. Only the processed sound goes into the project, so the knob carries the per-type mix.
  const json = project.samplerJson;
  const samples: any[] = (json.samples = Array.isArray(json.samples) ? json.samples : []);
  const pads: any[] = (json.pads = Array.isArray(json.pads) ? json.pads : []);
  const base = project.padBase;
  let nextId = Math.max(0, ...samples.map((x) => Number(x.id) || 0), ...pads.map((x) => Number(x.sampleId) || 0)) + 1;
  let nextPad = Math.max(HIDDEN_PAD_BASE - 1, ...pads.map((x) => Number(x.pad) - base)) + 1;
  const sounds: WrittenSound[] = [];
  const numbering = new Map<string, number>();
  for (const [n, { file, group }] of taken.entries()) {
    onProgress?.(`Levelling ${n + 1}/${taken.length}`);
    const { category, is808 } = groups[group];
    const numberKey = `${category}:${!!is808}`;
    const number = (numbering.get(numberKey) ?? 0) + 1; numbering.set(numberKey, number);
    const decoded = await decodeNative(await file.source());
    const channelData = applyGainDb(decoded.channelData, balance.gainDb[existing.length + n]);
    const frames = channelData[0].length;
    const sampleId = nextId++;
    const pad = nextPad++;
    const knobDb = balance.knobDb[existing.length + n];
    const fileName = bankFileName(category, number, is808);
    project.zip.file(`sampler/${sampleId}.wav`, await encodeWav({ sampleRate: decoded.sampleRate, channelData, bitDepth: 24 }).arrayBuffer());
    const sourcePath = file.sourcePath ?? [...(file.rootFolder ? [file.rootFolder] : []), ...file.folders, file.sourceName ?? file.name].join("/");
    const libraryId = file.libraryId ?? `sample-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    samples.push({ id: sampleId, metadata: { originalPath: fileName, sourcePath, tunegodClassification: file.classification, tunegodLibraryId: libraryId } });
    pads.push({ pad: pad + base, type: "sample", sampleId, vol: volFromDb(knobDb), pan: 0.5, pitch: 0, start: 0, end: frames, zoomStart: 0, zoomEnd: frames });
    project.pads.push({ pad, sampleId, fileName });
    sounds.push({
      pad,
      sampleId,
      fileName,
      category,
      is808: !!is808 || ((category === "bass" || category === "bassLoop") && [file.sourcePath ?? "", file.rootFolder ?? "", ...file.folders, file.name].some(is808Name)),
      classification: file.classification,
      knobDb,
      group,
      number,
      libraryId,
      sourceName: file.sourceName ?? file.name,
      sourcePath,
      sourcePack: file.sourcePack ?? sourcePackOf(file),
      favorite: !!file.favorite,
    });
  }
  // A tiny library can still fill the kit: independent pads share existing sample audio.
  const available = [...sounds];
  while (sounds.length < fillTo && available.length) {
    const source = available[Math.min(available.length - 1, Math.floor(random() * available.length))];
    const pad = nextPad++;
    const original = pads.find(p => p.pad === source.pad + base);
    pads.push({ ...original, pad: pad + base });
    project.pads.push({ pad, sampleId: source.sampleId, fileName: source.fileName });
    sounds.push({ ...source, pad });
  }
  project.zip.file("sampler/sampler.json", JSON.stringify(json));
  const blob = await project.zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true });
  return { file: new File([blob], project.originalName, { type: "application/octet-stream" }), sounds, skipped };
}

/** Takes sounds out of the project for good (a bank being loaded again replaces its sounds): their pads, samples and audio, and any notes recorded on them. */
async function removeFromProject(project: ParsedKoalaProject, padNumbers: number[]): Promise<void> {
  const gone = new Set(padNumbers);
  const base = project.padBase;
  const json = project.samplerJson;
  const ids = new Set<number>();
  json.pads = (json.pads ?? []).filter((p: any) => {
    if (p.type !== "sample" || !gone.has(Number(p.pad) - base)) return true;
    ids.add(p.sampleId);
    return false;
  });
  const stillUsed = new Set((json.pads as any[]).filter((p) => p.type === "sample").map((p) => p.sampleId));
  for (const id of ids) {
    if (stillUsed.has(id)) continue;
    project.zip.remove(`sampler/${id}.wav`);
    json.samples = (json.samples ?? []).filter((s: any) => s.id !== id);
  }
  project.pads = project.pads.filter((p) => !gone.has(p.pad));
  const sequenceEntry = project.zip.file("sequence.json");
  if (sequenceEntry) {
    const sequence = JSON.parse(await sequenceEntry.async("string"));
    for (const seq of sequence.sequences ?? []) {
      const pattern = seq?.noteSequence?.pattern;
      if (Array.isArray(pattern?.notes)) pattern.notes = pattern.notes.filter((note: any) => !gone.has(Number(note.num) - base));
    }
    project.zip.file("sequence.json", JSON.stringify(sequence));
  }
}

/** The name of the sound a blank project holds in place of nothing; it is not a sound, and loading skips it. */
export const BLANK_SOUND_NAME = "silence.wav";

/**
 * A project with no sounds in it, for a bank loader to fill when nothing is open: Koala projects need at least one pad, so it holds one
 * silent pad (named like the layout's silent placeholders, which loading leaves out, and which the export drops).
 */
export async function blankProject(name = "tunegod"): Promise<File> {
  const zip = new JSZip();
  const frames = 88;
  zip.file("sampler/1.wav", await encodeWav({ sampleRate: 44100, channelData: [new Float32Array(frames)], bitDepth: 24 }).arrayBuffer());
  const pad = { pad: 63, type: "sample", sampleId: 1, vol: 1, pan: 0.5, pitch: 0, start: 0, end: frames, zoomStart: 0, zoomEnd: frames };
  zip.file("sampler/sampler.json", JSON.stringify({ samples: [{ id: 1, metadata: { originalPath: BLANK_SOUND_NAME } }], pads: [pad] }));
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return new File([blob], `${name}.koala`, { type: "application/octet-stream" });
}

/** A file name that says the sound is a vocal stem. */
const STEM_NAME = /vocal|acap|vox|stem/i;

/**
 * A project for acapella mode made from two audio files: the song on pad 48 and its vocal stem on pad 49, the stem labelled like the song with
 * VOCALS after it (what acapella mode looks for). The stem is the file whose name says so (vocals, acapella, vox, stem); returns a message instead
 * when the two files cannot be told apart or the audio cannot be read.
 */
/** Which of two picked audio files is the song and which the vocal stem: by the file names when exactly one says vocals / acapella / vox / stem, otherwise the first is the song. The user can swap them. */
export function guessAcapellaRoles(files: File[]): { song: File; stem: File } {
  const stems = files.filter((f) => STEM_NAME.test(f.name));
  if (stems.length === 1) return { stem: stems[0], song: files.find((f) => f !== stems[0])! };
  return { song: files[0], stem: files[1] };
}

export async function acapellaProjectFromAudio(files: File[], roles?: { song: File; stem: File }): Promise<{ file: File } | { problem: string }> {
  if (files.length !== 2) return { problem: "Acapella mode needs two audio files: the song and its vocal stem. Pick both together, or open a Koala project that already holds them." };
  const stems = files.filter((f) => STEM_NAME.test(f.name));
  if (!roles && stems.length !== 1) return { problem: 'Could not tell which file is the vocal stem. Name it with "vocals" (or "acapella") and pick the song and the stem together.' };
  const stem = roles ? roles.stem : stems[0];
  const song = roles ? roles.song : files.find((f) => f !== stem)!;
  const zip = new JSZip();
  const samples: any[] = [];
  const pads: any[] = [];
  const title = song.name.replace(/\.[^.]+$/, "");
  try {
    for (const [n, [file, label]] of [[song, title], [stem, `${title} VOCALS`]].entries() as Iterable<[number, [File, string]]>) {
      const decoded = await decodeNative(file);
      const frames = decoded.channelData[0].length;
      const sampleId = n + 1;
      zip.file(`sampler/${sampleId}.wav`, await encodeWav({ sampleRate: decoded.sampleRate, channelData: decoded.channelData, bitDepth: 24 }).arrayBuffer());
      samples.push({ id: sampleId, metadata: { originalPath: file.name } });
      pads.push({ pad: 48 + n, type: "sample", sampleId, label, vol: 1, pan: 0.5, pitch: 0, start: 0, end: frames, zoomStart: 0, zoomEnd: frames });
    }
  } catch {
    return { problem: "One of the audio files could not be read." };
  }
  zip.file("sampler/sampler.json", JSON.stringify({ samples, pads }));
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { file: new File([blob], `${title}.koala`, { type: "application/octet-stream" }) };
}
