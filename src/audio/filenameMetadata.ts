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
 * (treated as major). An uppercase note letter is trusted on its own; a
 * lowercase one ("cmin", "f#minor") is only accepted with an explicit
 * spelled-out mode suffix, to keep stray lowercase letters/words from
 * false-positiving.
 */
function parseKeyToken(token: string): { tonicPitchClass: number; scale: "major" | "minor" } | undefined {
  const m = token.match(/^([A-Ga-g])(#|b)?([A-Za-z]*)$/);
  if (!m) return undefined;
  const [, letter, accidental, suffix] = m;
  const suffixLower = suffix.toLowerCase();
  const explicitSuffix = ["maj", "major", "min", "minor"].includes(suffixLower);
  if (letter === letter.toLowerCase() && !explicitSuffix) return undefined;

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
  // from the back to avoid an earlier unrelated token winning. The mode
  // word is often split from the note by a delimiter ("C min", "c_minor"),
  // so a two-token join is tried before the token alone — joining also
  // makes a lowercase bare letter acceptable, since the explicit mode word
  // vouches for it.
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (i + 1 < tokens.length) {
      const joined = parseKeyToken(tokens[i] + tokens[i + 1]);
      if (joined) return joined;
    }
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
