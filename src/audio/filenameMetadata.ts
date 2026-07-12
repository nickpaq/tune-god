// Sample-pack filenames very often already encode the loop's key and tempo
// (e.g. "J_VNS_124_songstarter_classics_Am.wav" — 124 BPM, A minor). That's
// generally more reliable than on-device detection, so it's used as the
// starting point when present; the analysis result is always still
// available as a fallback / manual revert.
import { pitchClassIndex } from "./theory";

export interface FilenameMetadata {
  bpm?: number;
  tonicPitchClass?: number;
  scale?: "major" | "minor";
}

const MIN_BPM = 40;
const MAX_BPM = 220;

function tokenize(fileName: string): string[] {
  const base = fileName.replace(/\.[^./\\]+$/, "");
  return base.split(/[_\-\s.]+/).filter(Boolean);
}

function parseBpm(tokens: string[]): number | undefined {
  for (const token of tokens) {
    const explicit = token.match(/^(\d{2,3})bpm$/i);
    if (explicit) return Number(explicit[1]);
  }
  for (const token of tokens) {
    if (/^\d{2,3}$/.test(token)) {
      const n = Number(token);
      if (n >= MIN_BPM && n <= MAX_BPM) return n;
    }
  }
  return undefined;
}

/**
 * Matches a delimited token like "Am", "F#min", "Bbmaj", or a bare "C"
 * (treated as major). Requires the note letter to be uppercase to keep
 * stray lowercase letters/words from false-positiving.
 */
function parseKeyToken(token: string): { tonicPitchClass: number; scale: "major" | "minor" } | undefined {
  const m = token.match(/^([A-G])(#|b)?([A-Za-z]*)$/);
  if (!m) return undefined;
  const [, letter, accidental, suffix] = m;
  const suffixLower = suffix.toLowerCase();

  let scale: "major" | "minor";
  if (suffixLower === "" || suffixLower === "maj" || suffixLower === "major") scale = "major";
  else if (suffixLower === "m" || suffixLower === "min" || suffixLower === "minor") scale = "minor";
  else return undefined;

  try {
    return { tonicPitchClass: pitchClassIndex(`${letter}${accidental ?? ""}`), scale };
  } catch {
    return undefined;
  }
}

function parseKey(tokens: string[]): { tonicPitchClass: number; scale: "major" | "minor" } | undefined {
  // Key labels conventionally sit near the end of the filename, so scan
  // from the back to avoid an earlier unrelated token winning.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const key = parseKeyToken(tokens[i]);
    if (key) return key;
  }
  return undefined;
}

export function parseFilenameMetadata(fileName: string): FilenameMetadata {
  const tokens = tokenize(fileName);
  const bpm = parseBpm(tokens);
  const key = parseKey(tokens);
  return { bpm, tonicPitchClass: key?.tonicPitchClass, scale: key?.scale };
}
