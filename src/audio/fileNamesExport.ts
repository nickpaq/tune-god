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
