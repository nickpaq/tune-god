import { AUDIO_EXTENSIONS } from "./samplePack";
import { categoryLabel } from "./classify";
import type { LibraryIndex } from "./libraryIndex";

/** One entry the folder picker handed over: its relative path (root folder first) and size. */
export interface RawEntry { path: string; size: number }

const count = <K,>(map: Map<K, number>, key: K, by = 1) => map.set(key, (map.get(key) ?? 0) + by);
const top = <K,>(map: Map<K, number>, limit = Infinity) => [...map].sort((a, b) => b[1] - a[1]).slice(0, limit);
const n = (value: number) => value.toLocaleString("en-US");

/**
 * Accounts for every file the picker delivered: what was skipped and why, what was indexed, and how it was typed.
 * It mirrors the filters in `findPackInFileListAsync`, so the numbers explain exactly where a library shrinks.
 */
export function buildScanReport(raw: RawEntry[], index: LibraryIndex, when = new Date()): string {
  const hidden = { appleDouble: 0, macosx: 0, dotFolder: 0, dotFile: 0 };
  const extensions = new Map<string, number>();
  const audioPaths = new Map<string, number>();
  const zeroByte: string[] = [];
  let audioEntries = 0;
  const folderAudio = new Map<string, number>();
  for (const entry of raw) {
    const parts = entry.path.split("/");
    const name = parts[parts.length - 1];
    if (parts.includes("__MACOSX")) { hidden.macosx++; continue; }
    if (parts.slice(0, -1).some((p) => p.startsWith("."))) { hidden.dotFolder++; continue; }
    if (name.startsWith("._")) { hidden.appleDouble++; continue; }
    if (name.startsWith(".")) { hidden.dotFile++; continue; }
    if (!AUDIO_EXTENSIONS.test(name)) {
      const dot = name.lastIndexOf(".");
      count(extensions, dot > 0 ? name.slice(dot).toLowerCase() : "(no extension)");
      continue;
    }
    audioEntries++;
    const firstSeen = !audioPaths.has(entry.path);
    count(audioPaths, entry.path);
    if (!firstSeen) continue;
    if (entry.size <= 0 && zeroByte.length < 10) zeroByte.push(entry.path);
    count(folderAudio, parts.length > 2 ? parts[1] : "(top level)");
  }
  const uniqueAudio = audioPaths.size;
  const duplicates = audioEntries - uniqueAudio;
  const hiddenTotal = hidden.appleDouble + hidden.macosx + hidden.dotFolder + hidden.dotFile;
  const otherTotal = [...extensions.values()].reduce((a, b) => a + b, 0);

  const indexed = index.samples;
  const missing = Math.max(0, uniqueAudio - indexed.length);
  const types = new Map<string, number>();
  const evidence = new Map<string, number>();
  const folderIndexed = new Map<string, number>();
  const folderOther = new Map<string, number>();
  const otherSamples: string[] = [];
  let review = 0;
  for (const sample of indexed) {
    count(types, categoryLabel(sample.classification.category));
    count(evidence, sample.classification.evidence);
    const parts = sample.path.split("/");
    const folder = parts.length > 2 ? parts[1] : "(top level)";
    count(folderIndexed, folder);
    if (sample.classification.needsReview) review++;
    if (sample.classification.category === "other") {
      count(folderOther, folder);
      if (otherSamples.length < 20) otherSamples.push(sample.path);
    }
  }
  const other = types.get(categoryLabel("other")) ?? 0;

  const lines: string[] = [];
  lines.push(`TuneGod library scan report · ${when.toISOString()}`);
  lines.push(`Folder: ${index.name}`);
  lines.push("");
  lines.push("== Where the files went ==");
  lines.push(`Entries delivered by the folder picker: ${n(raw.length)}`);
  lines.push(`  Hidden, skipped: ${n(hiddenTotal)}`);
  if (hiddenTotal) lines.push(`    "._" copies (macOS resource forks): ${n(hidden.appleDouble)} · __MACOSX: ${n(hidden.macosx)} · inside dot folders: ${n(hidden.dotFolder)} · other dot files: ${n(hidden.dotFile)}`);
  lines.push(`  Not a supported audio extension, skipped: ${n(otherTotal)}`);
  for (const [ext, total] of top(extensions, 15)) lines.push(`    ${ext}: ${n(total)}`);
  lines.push(`  Audio files (wav, wave, aif, aiff, flac, mp3, ogg, m4a): ${n(audioEntries)}`);
  if (duplicates) lines.push(`    Duplicate paths merged: ${n(duplicates)}`);
  lines.push(`  Unique audio files: ${n(uniqueAudio)}`);
  lines.push(`Indexed in the library: ${n(indexed.length)}${missing ? ` (${n(missing)} unique audio files are missing from the index)` : ""}`);
  if (zeroByte.length) lines.push(`Zero-byte audio files (cannot be loaded), first ${zeroByte.length}: ${zeroByte.join(" | ")}`);
  lines.push("");
  lines.push("== Types ==");
  for (const [label, total] of top(types)) lines.push(`  ${label}: ${n(total)}`);
  lines.push(`Typed as Other (no folder or name told us): ${n(other)} · flagged for review: ${n(review)}`);
  lines.push(`Evidence: ${top(evidence).map(([k, total]) => `${k} ${n(total)}`).join(", ")}`);
  lines.push("");
  lines.push("== By first-level folder (unique audio files / indexed / typed Other) ==");
  for (const [folder, total] of top(folderAudio, 60)) lines.push(`  ${folder}: ${n(total)} / ${n(folderIndexed.get(folder) ?? 0)} / ${n(folderOther.get(folder) ?? 0)}`);
  if (folderAudio.size > 60) lines.push(`  …and ${n(folderAudio.size - 60)} more folders`);
  if (otherSamples.length) {
    lines.push("");
    lines.push("== Sample of files typed Other ==");
    for (const path of otherSamples) lines.push(`  ${path}`);
  }
  lines.push("");
  lines.push("If the picker delivered far fewer entries than the folder holds, the shortfall is the browser's (iOS can cap very large folder picks or omit iCloud files that are not downloaded), not the app's.");
  return lines.join("\n");
}
