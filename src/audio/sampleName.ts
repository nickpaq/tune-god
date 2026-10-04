/**
 * A sample's file name as a person would say it: "03 - [clap] Luxury Clap.wav" becomes "Luxury Clap". The extension,
 * a leading track number, bracketed tags such as [clap] and underscores are dropped. Falls back to the plain name
 * (minus extension) when nothing readable is left.
 */
export function cleanSampleName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "");
  const cleaned = base
    .replace(/[[{][^\]}]*[\]}]/g, " ") // [tags] and {tags}
    .replace(/_+/g, " ")
    // A leading index: "03 - ", "03.", "03)" always; "03 " only for one or two digits, so "808 Kick" keeps its 808.
    .replace(/^\s*(\d+\s*[-–—.)]+\s*|\d{1,2}\s+(?=\D))/, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, "")
    .trim();
  return cleaned || base.replace(/_+/g, " ").trim() || fileName;
}

/** A pack tag in front of the name: "Rio - Bell Perc" has the tag "Rio". */
const TAGGED = /^(.+?)\s+[-–—]\s+(.+)$/;

/**
 * The tags (lower case) that many sounds in the project start with, such as the pack's name in "Rio - Bell Perc". A tag counts
 * once at least four sounds and 30% of all of them carry it; shorter runs are just part of those names.
 */
export function packTags(fileNames: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const name of fileNames) {
    const tag = cleanSampleName(name).match(TAGGED)?.[1].toLowerCase();
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const common = new Set<string>();
  for (const [tag, n] of counts) if (n >= 4 && n >= fileNames.length * 0.3) common.add(tag);
  return common;
}

/** A sound's name for the swap list: cleaned (see cleanSampleName), and without a pack tag the project's sounds share. */
export function displayName(fileName: string, tags: Set<string>): string {
  const cleaned = cleanSampleName(fileName);
  const m = cleaned.match(TAGGED);
  return m && tags.has(m[1].toLowerCase()) ? m[2] : cleaned;
}
