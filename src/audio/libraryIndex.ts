import { classifyFile, categoryOfFolder, type PackFile } from "./samplePack";
import type { SampleClassification } from "./sampleClassification";
import { NOTE_NAMES } from "./theory";
import { bpmFromName, keyFromName } from "./pitch/nameKey";

export interface IndexedSample {
  id: string;
  path: string;
  folders: string[];
  name: string;
  size: number;
  lastModified?: number;
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
  samples: IndexedSample[];
}
export interface LibraryPack {
  id: string;
  name: string;
  samples: IndexedSample[];
}

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

/** Rebind files without reading audio. Unchanged metadata retains its classification; refresh reruns rules, keeping corrections. */
export function refreshLibrary<T>(
  name: string,
  files: PackFile<T>[],
  previous?: LibraryIndex | null,
  force = false,
): { index: LibraryIndex; files: PackFile<T>[]; reused: number } {
  const id = `library:${name}`;
  const old = new Map(
    previous?.id === id
      ? previous.samples.map((sample) => [sample.path, sample])
      : [],
  );
  // An untyped sibling (e.g. Extras or Unknown) belongs to an already recognized pack, not a new pack.
  const established = new Set(
    files
      .filter((file) =>
        file.folders.some((folder) => categoryOfFolder(folder) !== null),
      )
      .map(packPath),
  );
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
  for (const file of files) {
    const path = sourcePath(file);
    if (seen.has(path)) continue;
    seen.add(path);
    const saved = old.get(path);
    const unchanged =
      saved &&
      saved.size === file.size &&
      saved.lastModified === file.lastModified;
    const classification =
      saved?.correction ??
      (unchanged && !force
        ? saved.classification
        : classifyFile(
            [...(file.rootFolder ? [file.rootFolder] : []), ...file.folders],
            file.name,
          ));
    if (unchanged && !force) reused++;
    const key = keyFromName(file.name);
    const sample: IndexedSample = {
      id: `${id}:${path}`,
      path,
      folders: file.folders,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      pack: packFor(file),
      classification,
      correction: saved?.correction,
      bpm: bpmFromName(file.name) ?? undefined,
      key: key
        ? `${NOTE_NAMES[key.pc]}${key.minor ? " minor" : " major"}`
        : undefined,
    };
    samples.push(sample);
    rebound.push({
      ...file,
      libraryId: sample.id,
      classification,
      sourcePack: sample.pack,
      sourcePath: path,
    });
  }
  return {
    index: { id, name, updatedAt: Date.now(), samples },
    files: rebound,
    reused,
  };
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
    ...classification,
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
