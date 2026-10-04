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
