// A key or tempo written in a sample's file name ("Dark_Pluck_Am_140bpm.wav"). When a name says it, the pack's maker has told us, and that beats anything
// measured from the audio. Names are read conservatively: a lone letter ("A", "B") is far more often a word or a take number than a key, so a key needs
// an accidental ("F#", "Bb"), a quality ("Am", "Cmin", "G major") or the word "key" beside it.

export interface NameKey {
  /** The key's tonic as written: 0 = C ... 11 = B. */
  pc: number;
  minor: boolean;
  /** The relative minor's tonic (a major key and its relative minor are one answer for a loop; see loopKey.ts). */
  minorPc: number;
}

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const stem = (fileName: string) => fileName.replace(/\.[a-z0-9]{2,4}$/i, "");

/** Splits a name on its separators, and between a number and the letters after it ("140bpm" -> "140", "bpm"). */
const tokensOf = (fileName: string) =>
  stem(fileName)
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .split(/[\s_\-.()[\]]+/)
    .filter(Boolean);

// Capital letters only: "am", "e" and "dm" are words and typos, and packs write note names as capitals.
const KEY_TOKEN = /^([A-G])([#b♯♭]?)(m|min|minor|maj|major)?$/;

export function keyFromName(fileName: string): NameKey | null {
  const tokens = tokensOf(fileName);
  for (let i = 0; i < tokens.length; i++) {
    const match = KEY_TOKEN.exec(tokens[i]);
    if (!match) continue;
    const [, letter, accidental, quality] = match;
    const keyword = /^key$/i.test(tokens[i - 1] ?? "") || /^key$/i.test(tokens[i + 1] ?? "");
    if (!quality && !accidental && !keyword) continue;
    const accidentalShift = accidental === "#" || accidental === "♯" ? 1 : accidental === "b" || accidental === "♭" ? -1 : 0;
    const pc = (NOTE_PC[letter] + accidentalShift + 12) % 12;
    const minor = quality === "m" || quality === "min" || quality === "minor";
    return { pc, minor, minorPc: minor ? pc : (pc + 9) % 12 };
  }
  return null;
}

/** The tempo a name states ("140bpm", "140 BPM", "bpm140", "BPM_95"), or null. Only a number beside the word "bpm" counts: other numbers are take numbers. */
export function bpmFromName(fileName: string): number | null {
  const tokens = tokensOf(fileName);
  for (let i = 0; i < tokens.length; i++) {
    if (!/^bpm$/i.test(tokens[i])) continue;
    for (const near of [tokens[i - 1], tokens[i + 1]]) {
      const bpm = near !== undefined && /^\d{2,3}$/.test(near) ? Number(near) : NaN;
      if (bpm >= 40 && bpm <= 250) return bpm;
    }
  }
  return null;
}
