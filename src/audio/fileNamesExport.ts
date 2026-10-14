import { categoryLabel } from "./classify";
import type { LibraryIndex } from "./libraryIndex";

export type FileNamesScope = "all" | "unclassified";

/**
 * The library's file names as tab-separated text (Type, how it was decided, path), for looking for naming patterns outside the app. The picked folder's own name
 * is left off each path. "unclassified" keeps only the files nothing could type (Other, no correction), the ones a new rule could catch.
 */
export function fileNamesExport(index: LibraryIndex, scope: FileNamesScope = "all"): string {
  const rows = index.samples
    .filter((sample) => scope === "all" || (sample.classification.category === "other" && !sample.correction))
    .map((sample) => {
      const parts = sample.path.split("/");
      return `${categoryLabel(sample.classification.category)}\t${sample.classification.evidence}\t${parts.slice(1).join("/") || sample.path}`;
    })
    .sort((a, b) => a.split("\t")[2].localeCompare(b.split("\t")[2]));
  return ["Type\tHow\tPath", ...rows].join("\n") + "\n";
}

interface TreeNode { folders: Map<string, TreeNode>; files: string[]; count: number }

/**
 * The library as an indented text tree: every folder and subfolder by name, with the audio files inside it. The index holds audio files only (wav, wave, aif,
 * aiff, flac, mp3, ogg, m4a), so .asd, images, MIDI and the like never appear. Each folder line carries the number of audio files under it.
 */
export function fileTreeExport(index: LibraryIndex): string {
  const root: TreeNode = { folders: new Map(), files: [], count: 0 };
  for (const sample of index.samples) {
    const parts = sample.path.split("/");
    let node = root;
    node.count++;
    for (const folder of parts.slice(0, -1)) {
      let next = node.folders.get(folder);
      if (!next) { next = { folders: new Map(), files: [], count: 0 }; node.folders.set(folder, next); }
      next.count++;
      node = next;
    }
    node.files.push(parts[parts.length - 1]);
  }
  const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  const lines: string[] = [];
  const walk = (node: TreeNode, depth: number) => {
    const pad = "  ".repeat(depth);
    for (const name of [...node.folders.keys()].sort(compare)) {
      const child = node.folders.get(name)!;
      lines.push(`${pad}${name}/  (${child.count.toLocaleString("en-US")})`);
      walk(child, depth + 1);
    }
    for (const file of [...node.files].sort(compare)) lines.push(`${pad}${file}`);
  };
  walk(root, 0);
  return lines.join("\n") + "\n";
}
