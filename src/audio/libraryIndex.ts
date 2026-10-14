import { classifyFile, categoryOfFolder, CLASSIFIER_VERSION, tidy, type FolderTypes, type PackFile } from "./samplePack";
import { categoryLabel, type CategoryId } from "./classify";
import { normalizeClassification, type SampleClassification } from "./sampleClassification";
import { NOTE_NAMES } from "./theory";
import { bpmFromName, keyFromName } from "./pitch/nameKey";

export interface IndexedSample {
  id: string;
  path: string;
  folders: string[];
  name: string;
  size: number;
  lastModified?: number;
  duration?: number;
  pack: string;
  classification: SampleClassification;
  correction?: SampleClassification;
  bpm?: number;
  key?: string;
}
export interface LibraryIndex {
  id: string;
  name: string;
  updatedAt: number;
  classificationVersion?: number;
  /** Rule set the stored classifications came from (see CLASSIFIER_VERSION); older or missing means unchanged files are reclassified once. */
  classifierVersion?: number;
  /** Which folder Types (see FolderTypes) the stored classifications were made with; a change reclassifies unchanged files. */
  folderTypesKey?: string;
  /** Order-independent hash of every file's path and size: when it matches on reconnect the saved records are adopted as they are. */
  fingerprint?: string;
  samples: IndexedSample[];
}
export interface LibraryPack {
  id: string;
  name: string;
  samples: IndexedSample[];
}

/** Increment whenever canonical classification rules change. */
export const CLASSIFICATION_VERSION = 2;

const structural =
  /^(samples?|sounds?|audio|wav|wavs|one[ _-]?shots?|shots?|hits?|drums?|loops?|packs?|kits?|dry|wet|processed|stems?)$/i;

/** Typed subtrees belong to the nearest named pack; organization paths remain part of its identity. */
export function packPath<T>(file: PackFile<T>): string {
  const folders = file.folders;
  const typed = folders.findIndex(
    (folder) => categoryOfFolder(folder) !== null,
  );
  const before = typed >= 0 ? folders.slice(0, typed) : folders;
  const end = before.findLastIndex((folder) => !structural.test(folder));
  return end >= 0
    ? before.slice(0, end + 1).join("/")
    : (file.rootFolder ?? "Selected pack");
}
const sourcePath = <T>(file: PackFile<T>) =>
  file.sourcePath ??
  [
    ...(file.rootFolder ? [file.rootFolder] : []),
    ...file.folders,
    file.name,
  ].join("/");

export interface LibraryProgress {
  stage: string;
  processed: number;
  total: number;
  percent: number;
}
/** Two 32-bit FNV-style hashes of a string, so the combined 64 bits make an accidental match negligible. */
function hashPair(text: string): [number, number] {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = (Math.imul(b, 0x85ebca6b) + c) >>> 0;
  }
  return [a, b];
}
/** Hash of the unique paths and sizes, combined by addition so file order (and sorting) does not matter. */
function fingerprintOf<T>(files: PackFile<T>[]): { fingerprint: string; paths: string[] } {
  let x = 0, y = 0;
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const file of files) {
    const path = sourcePath(file);
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
    const [a, b] = hashPair(`${path}\u0000${file.size}`);
    x = (x + a) >>> 0;
    y = (y + b) >>> 0;
  }
  return { fingerprint: `${paths.length}:${x.toString(36)}:${y.toString(36)}`, paths };
}
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Rebind files without reading audio. Unchanged metadata retains its classification; refresh reruns rules, keeping corrections. */
function* refreshSteps<T>(
  name: string,
  files: PackFile<T>[],
  previous?: LibraryIndex | null,
  force = false,
  folderTypes?: FolderTypes,
): Generator<LibraryProgress, { index: LibraryIndex; files: PackFile<T>[]; reused: number }> {
  const id = `library:${name}`;
  const old = new Map<string, IndexedSample>();
  const savedSamples = previous?.id === id ? previous.samples : [];
  const folderTypesKey = folderTypesKeyOf(folderTypes);
  const currentRules = previous?.classifierVersion === CLASSIFIER_VERSION && (previous.folderTypesKey ?? "") === folderTypesKey;
  yield { stage: "Restoring saved index", processed: 0, total: savedSamples.length, percent: 15 };
  for (let i = 0; i < savedSamples.length; i++) {
    old.set(savedSamples[i].path, savedSamples[i]);
    if ((i + 1) % 500 === 0) yield { stage: "Restoring saved index", processed: i + 1, total: savedSamples.length, percent: 15 + 5 * (i + 1) / savedSamples.length };
  }
  const currentFingerprint = fingerprintOf(files).fingerprint;
  if (!force && previous?.id === id && currentRules && previous.classificationVersion === CLASSIFICATION_VERSION && previous.fingerprint === currentFingerprint) {
    // Same files, same sizes, same rules: adopt the saved records and only attach each file to its record.
    const rebound: PackFile<T>[] = [];
    const byPath = new Map(savedSamples.map((sample) => [sample.path, sample]));
    const attached = new Set<string>();
    let legacy = false;
    for (const file of files) {
      const path = sourcePath(file);
      const sample = byPath.get(path);
      if (!sample || (file.duration !== undefined && file.duration !== sample.duration)) break;
      if (attached.has(path)) continue;
      attached.add(path);
      const classification = normalizeClassification(sample.classification);
      if (classification.category !== sample.classification.category || Object.keys(sample.classification).length !== Object.keys(classification).length || (sample.correction && Object.keys(sample.correction).length !== 4)) legacy = true;
      rebound.push({ ...file, libraryId: sample.id, classification, sourcePack: sample.pack, sourcePath: path });
    }
    if (attached.size === savedSamples.length) {
      // Records saved by older versions (retired categories, subtype fields) are normalized; current ones are adopted untouched.
      const index = legacy
        ? { ...previous, samples: savedSamples.map((sample) => ({ ...sample, classification: normalizeClassification(sample.classification), correction: sample.correction ? normalizeClassification(sample.correction) : undefined })) }
        : previous;
      return { index, files: rebound, reused: savedSamples.length };
    }
  }
  const established = new Set<string>();
  yield { stage: "Identifying sample packs", processed: 0, total: files.length, percent: 20 };
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.folders.some((folder) => categoryOfFolder(folder) !== null)) established.add(packPath(file));
    if ((i + 1) % 500 === 0) yield { stage: "Identifying sample packs", processed: i + 1, total: files.length, percent: 20 + 20 * (i + 1) / files.length };
  }
  const packFor = (file: PackFile<T>) => {
    for (let length = file.folders.length; length > 0; length--) {
      const parent = file.folders.slice(0, length).join("/");
      if (established.has(parent)) return parent;
    }
    return packPath(file);
  };
  let reused = 0;
  const seen = new Set<string>();
  const rebound: PackFile<T>[] = [];
  const samples: IndexedSample[] = [];
  yield { stage: "Classifying samples and matching saved records", processed: 0, total: files.length, percent: 40 };
  for (const [i, file] of files.entries()) {
    if (i > 0 && i % 250 === 0) yield { stage: "Classifying samples and matching saved records", processed: i, total: files.length, percent: 40 + 50 * i / files.length };
    const path = sourcePath(file);
    if (seen.has(path)) continue;
    seen.add(path);
    const saved = old.get(path);
    // Path and size identify an unchanged file; modified times are not trusted (some devices report them unstably).
    const unchanged = saved && saved.size === file.size;
    const duration = file.duration ?? (unchanged ? saved.duration : undefined);
    const reuseClassification = unchanged && !force && currentRules && previous?.classificationVersion === CLASSIFICATION_VERSION && duration === saved.duration;
    const classification = normalizeClassification(
      saved?.correction ??
      (reuseClassification
        ? saved.classification
        : classifyFile(
            [...(file.rootFolder ? [file.rootFolder] : []), ...file.folders],
            file.name,
            undefined,
            duration,
            folderTypes,
          )));
    if (reuseClassification) reused++;
    const key = keyFromName(file.name);
    const sample: IndexedSample = {
      id: `${id}:${path}`,
      path,
      folders: file.folders,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      duration,
      pack: packFor(file),
      classification,
      correction: saved?.correction ? normalizeClassification(saved.correction) : undefined,
      bpm: bpmFromName(file.name) ?? undefined,
      key: key
        ? `${NOTE_NAMES[key.pc]}${key.minor ? " minor" : " major"}`
        : undefined,
    };
    samples.push(sample);
    rebound.push({
      ...file,
      duration: sample.duration,
      libraryId: sample.id,
      classification,
      sourcePack: sample.pack,
      sourcePath: path,
    });
  }
  return {
    index: { id, name, updatedAt: Date.now(), classifierVersion: CLASSIFIER_VERSION, classificationVersion: CLASSIFICATION_VERSION, folderTypesKey, fingerprint: currentFingerprint, samples },
    files: rebound,
    reused,
  };
}
/** Synchronous entry point retained for callers and deterministic tests. */
export function refreshLibrary<T>(name: string, files: PackFile<T>[], previous?: LibraryIndex | null, force = false, folderTypes?: FolderTypes) {
  const steps = refreshSteps(name, files, previous, force, folderTypes);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
/** Metadata only: yield between batches so progress can paint and input stays responsive. */
export async function refreshLibraryAsync<T>(name: string, files: PackFile<T>[], previous?: LibraryIndex | null, force = false, onProgress?: (progress: LibraryProgress) => void, readDuration?: (source: T) => Promise<number | undefined>, folderTypes?: FolderTypes) {
  if (readDuration) {
    // Only files with no duration saved for the same path and size are opened; a reconnect of an unchanged library reads nothing here.
    const old = new Map(previous?.id === `library:${name}` ? previous.samples.map(sample => [sample.path, sample]) : []);
    const pending: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const saved = old.get(sourcePath(files[i]));
      if (files[i].duration === undefined && !(saved && saved.size === files[i].size && saved.duration !== undefined)) pending.push(i);
    }
    if (pending.length) {
      files = [...files];
      for (let i = 0; i < pending.length; i += 8) {
        onProgress?.({ stage: "Reading duration metadata", processed: i, total: pending.length, percent: 15 });
        await Promise.all(pending.slice(i, i + 8).map(async index => {
          const file = files[index];
          files[index] = { ...file, duration: await readDuration(file.source).catch(() => undefined) };
        }));
        if (i % 200 === 0) await yieldToBrowser();
      }
    }
  }
  const steps = refreshSteps(name, files, previous, force, folderTypes);
  let step = steps.next();
  while (!step.done) {
    onProgress?.(step.value);
    await yieldToBrowser();
    step = steps.next();
  }
  return step.value;
}

export function libraryPacks(index: LibraryIndex): LibraryPack[] {
  const packs = new Map<string, IndexedSample[]>();
  for (const sample of index.samples) {
    const row = packs.get(sample.pack) ?? [];
    row.push(sample);
    packs.set(sample.pack, row);
  }
  return [...packs]
    .map(([id, samples]) => ({ id, name: id, samples }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function correctSample(
  index: LibraryIndex,
  id: string,
  classification: SampleClassification,
): LibraryIndex {
  const correction = {
    ...normalizeClassification(classification),
    confidence: 1,
    needsReview: false,
    evidence: "correction" as const,
  };
  return {
    ...index,
    samples: index.samples.map((sample) =>
      sample.id === id
        ? { ...sample, classification: correction, correction }
        : sample,
    ),
  };
}

/** Upgrade persisted metadata even before files are reconnected; manual corrections remain authoritative. */
export function reclassifyLibrary(index: LibraryIndex): LibraryIndex {
  if (index.classificationVersion === CLASSIFICATION_VERSION) return index;
  return {
    ...index, classificationVersion: CLASSIFICATION_VERSION,
    samples: index.samples.map(sample => ({ ...sample, classification: classifyFile(
      sample.path.split("/").slice(0, -1), sample.name, sample.correction, sample.duration,
    ) })),
  };
}

/** A stable string for a set of folder Types, "" when there are none. */
export function folderTypesKeyOf(folderTypes?: FolderTypes): string {
  const entries = Object.entries(folderTypes ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([folder, category]) => `${folder}=${category}`).join("|") : "";
}

/** Reclassify a saved index from its stored paths alone (no files needed), keeping per-sample corrections. */
export function applyFolderTypes(index: LibraryIndex, folderTypes?: FolderTypes): LibraryIndex {
  return {
    ...index,
    folderTypesKey: folderTypesKeyOf(folderTypes),
    samples: index.samples.map((sample) => sample.correction ? sample : {
      ...sample,
      classification: normalizeClassification(classifyFile(sample.path.split("/").slice(0, -1), sample.name, undefined, sample.duration, folderTypes)),
    }),
  };
}

export interface AmbiguousFolder {
  /** Key of the user's folder Type: `tidy(name)`. */
  key: string;
  /** The folder as it is written in the library. */
  name: string;
  files: number;
  examples: string[];
  /** Number of different packs the folder name appears in. */
  packs: number;
}

/** The folders whose files nothing could type, grouped by folder name so one answer covers the name in every pack. */
export function ambiguousFolders(index: LibraryIndex): AmbiguousFolder[] {
  const groups = new Map<string, AmbiguousFolder & { packSet: Set<string> }>();
  for (const sample of index.samples) {
    if (sample.classification.category !== "other" || sample.correction) continue;
    const parts = sample.path.split("/");
    const name = parts.length > 1 ? parts[parts.length - 2] : sample.pack;
    const key = tidy(name);
    if (!key) continue;
    const group = groups.get(key) ?? { key, name, files: 0, examples: [], packs: 0, packSet: new Set<string>() };
    group.files++;
    group.packSet.add(sample.pack);
    if (group.examples.length < 3) group.examples.push(sample.name);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ packSet, ...group }) => ({ ...group, packs: packSet.size })).sort((a, b) => b.files - a.files);
}

/** The list as tab-separated text, to copy out and fill in. */
export function ambiguousFoldersText(folders: AmbiguousFolder[], folderTypes: FolderTypes = {}): string {
  const lines = ["Folder\tFiles\tPacks\tType\tExamples"];
  for (const folder of folders) {
    const type = folderTypes[folder.key];
    lines.push(`${folder.name}\t${folder.files}\t${folder.packs}\t${type ? categoryLabel(type as CategoryId) : ""}\t${folder.examples.join(", ")}`);
  }
  return lines.join("\n");
}
