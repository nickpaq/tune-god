import { NOTE_NAMES } from "./theory";

/** " - Am - 140bpm" or " - 92.5bpm" at the end of a name this app already gave an export, so exporting an exported project does not repeat it. */
const INFO_SUFFIX = / - (?:[A-G][#b]?(?:m|maj) - )?\d+(?:\.\d+)?bpm$/i;

/** The key as it goes in a file name: "Am" for a minor key, "Cmaj" for a major one; null when no key is picked. */
export function keyLabel(pc: number | null, major: boolean): string | null {
  return pc === null || pc === undefined ? null : `${NOTE_NAMES[((pc % 12) + 12) % 12]}${major ? "maj" : "m"}`;
}

/**
 * The exported project's file name: the project's name (the packs, for a project the loaders named), then the key picked on the piano (left out when
 * there is none), then the tempo: "TuneGod - All Kits - Am - 140bpm.koala". A name from an earlier export loses its old key and tempo first.
 */
export function exportFileName(originalName: string, key: string | null, bpm: number): string {
  const base = originalName.replace(/\.koala$/i, "").replace(INFO_SUFFIX, "").replace(/_tuned$/i, "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "TuneGod";
  const tempo = `${Number(bpm.toFixed(2))}bpm`;
  return `${[base, key, tempo].filter(Boolean).join(" - ")}.koala`;
}
