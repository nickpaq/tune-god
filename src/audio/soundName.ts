// Pulls the readable name out of a sample file name. Packs bury it between a pack abbreviation, a tempo, a key and type words
// ("EUD_140_808_askari_Em.wav"): the tempo (a number in a plausible range, or beside "bpm"), the key (a note with a quality or accidental) and the
// type words are told apart from the name, and a prefix every sound of a folder shares ("RIO LEYVA", "OLIVER") is dropped. Display only: the
// classifier and the stored names are untouched.
import { stripProducerTags } from "./classify";

export interface SoundNameParts {
  /** The name left once the pack, tempo, key and type words are taken out, e.g. "Askari". */
  name: string;
  /** Pack abbreviation or a prefix shared across the folder, e.g. "EUD". */
  tag: string;
  bpm: number | null;
  /** Key as written, e.g. "Em", "A#m", "F#maj". */
  key: string | null;
  /** Words that say what kind of sound it is, e.g. "808". */
  kind: string[];
}

const KEY_CAPS = /^([A-G])([#b♯♭]?)(m|min|minor|maj|major|Major|Minor|Maj|Min|M)?$/;
const KIND_WORDS = new Set([
  "loop", "loops", "808", "808s", "bass", "sub", "kick", "kicks", "snare", "snares", "clap", "claps", "hat", "hats", "hh", "hihat", "cymbal", "crash", "ride", "perc", "percs", "percussion",
  "tom", "toms", "shaker", "vox", "vocal", "vocals", "fx", "sfx", "riser", "impact", "sweep", "drum", "drums", "fill", "fills", "oneshot", "shot", "melody", "melodic", "synth", "lead", "pad", "keys",
  "guitar", "piano", "bell", "bells", "pluck", "chord", "chords", "stack", "stacks", "chop", "chops", "stem", "songstarter", "top", "tops", "open", "closed", "low", "high",
]);
/** "Em", "G-MINOR", "F#min", "Bb Major" -> "Em", "Gm", "F#m", "Bbmaj". */
function normalKey(written: string): string {
  const m = /^([A-G])([#b♯♭]?)(.*)$/i.exec(written)!;
  const quality = m[3].toLowerCase();
  const minor = quality === "m" || quality === "min" || quality === "minor";
  const major = quality === "maj" || quality === "major" || quality === "M".toLowerCase() && m[3] === "M";
  return `${m[1].toUpperCase()}${m[2].replace("♯", "#").replace("♭", "b")}${minor ? "m" : major ? "maj" : ""}`;
}
const bpmOk = (n: number) => n >= 60 && n <= 200;

const stem = (fileName: string) => stripProducerTags(fileName).replace(/\.[a-z0-9]{2,4}$/i, "").replace(/\bone[ _-]?shots?\b/gi, "oneshot");

function tokensOf(fileName: string): string[] {
  return stem(fileName)
    .replace(/(\d)(bpm)/gi, "$1 $2")
    .replace(/(bpm)(\d)/gi, "$1 $2")
    // A number in brackets is a take number ("Hit (9)"), never a tempo.
    .replace(/\((\d+)\)/g, " n$1 ")
    .split(/[\s_\-.()[\]]+/)
    .filter((t) => /[a-z0-9]/i.test(t));
}

/** The leading run of short all-caps/number tokens that abbreviate a pack ("SS SC", "OS HHH", "EUD", "KSHMR"), if followed by more. */
function leadingTag(tokens: string[]): number {
  let n = 0;
  while (n < tokens.length - 1 && n < 3 && /^[A-Z][A-Z0-9]{1,9}$/.test(tokens[n]) && !KIND_WORDS.has(tokens[n].toLowerCase()) && !KEY_CAPS.test(tokens[n])) n++;
  return n;
}

const titleCase = (words: string[]) => words.map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");

/**
 * Splits one name into parts. `sharedPrefix` is how many leading tokens the folder's other files also start with (see `sharedPrefixLengths`);
 * those are the pack or maker, not the sound.
 */
export function parseSoundName(fileName: string, sharedPrefix = 0): SoundNameParts {
  const all = tokensOf(fileName);
  const tagLen = Math.max(sharedPrefix, leadingTag(all));
  const tagTokens = all.slice(0, Math.min(tagLen, Math.max(0, all.length - 1)));
  const rest = all.slice(tagTokens.length);
  let bpm: number | null = null;
  let key: string | null = null;
  const kind: string[] = [];
  const name: string[] = [];
  const bpmWord = rest.findIndex((t) => /^bpm$/i.test(t));
  // A number beside "bpm" is the tempo; otherwise the first bare number in range (808 and 909 are out of range, so they stay type words).
  const nearBpm = bpmWord >= 0 ? [rest[bpmWord - 1], rest[bpmWord + 1]].findIndex((t) => t !== undefined && /^\d{2,3}$/.test(t) && bpmOk(Number(t))) : -1;
  const bpmIndex = bpmWord >= 0 && nearBpm >= 0 ? (nearBpm === 0 ? bpmWord - 1 : bpmWord + 1) : rest.findIndex((t) => /^\d{2,3}$/.test(t) && bpmOk(Number(t)));
  let keyIndex = -1;
  for (let i = 0; i < rest.length && keyIndex < 0; i++) {
    const m = KEY_CAPS.exec(rest[i]);
    const quality = m?.[3] ?? (/^(m|min|minor|maj|major)$/i.test(rest[i + 1] ?? "") ? rest[i + 1] : undefined);
    const keyword = /^key$/i.test(rest[i - 1] ?? "") || /^key$/i.test(rest[i + 1] ?? "");
    if (m && (m[2] || quality || keyword)) {
      keyIndex = i;
      key = rest[i] + (m[3] ? "" : quality ?? "");
    }
  }
  rest.forEach((t, i) => {
    if (i === bpmIndex) bpm = Number(t);
    else if (/^bpm$/i.test(t)) return;
    else if (i === keyIndex) return;
    else if (keyIndex >= 0 && i === keyIndex + 1 && /^(m|min|minor|maj|major)$/i.test(t) && !KEY_CAPS.exec(rest[keyIndex])?.[3]) return;
    else if (/^key$/i.test(t) && (i === keyIndex - 1 || i === keyIndex + 1)) return;
    else if (KIND_WORDS.has(t.toLowerCase())) kind.push(t.toLowerCase());
    else name.push(t);
  });
  // Take numbers ("(9)", "01") are not a name; keep them only when nothing else is left.
  const words = name.filter((t) => !/^(\d{1,2}|n\d+)$/i.test(t));
  // Only a take number left ("GTASA (202)", "808 (62)", "Perc 29"): the name is then the tag, type words and number together.
  const onlyNumbers = words.length === 0;
  const taken = onlyNumbers ? [...tagTokens, ...kind, ...name.map((t) => t.replace(/^n/i, ""))] : words;
  const kinds = [...new Set(kind)];
  return { name: titleCase(taken.length ? taken : all), tag: onlyNumbers ? "" : tagTokens.join(" "), bpm, key: key ? normalKey(key) : null, kind: onlyNumbers ? [] : kinds };
}

/** For each file in a folder, how many leading tokens most of its siblings share (at least 3 siblings and 60% of them). */
export function sharedPrefixLengths(fileNames: string[]): number[] {
  const tokens = fileNames.map(tokensOf);
  if (tokens.length < 3) return fileNames.map(() => 0);
  let len = 0;
  for (;;) {
    const counts = new Map<string, number>();
    for (const t of tokens) if (t.length > len + 1) counts.set(t.slice(0, len + 1).join(" ").toLowerCase(), (counts.get(t.slice(0, len + 1).join(" ").toLowerCase()) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    if (best < Math.max(3, Math.ceil(tokens.length * 0.6))) break;
    len++;
  }
  // Only tokens that are not numbers/keys/type words count as a shared prefix.
  return tokens.map((t) => {
    let n = 0;
    while (n < len && n < t.length && !/^\d+$/.test(t[n]) && !KIND_WORDS.has(t[n].toLowerCase())) n++;
    return n;
  });
}

/** Parses many files at once so folder-wide prefixes are removed. `folderOf` groups files that sit together. */
export function parseSoundNames<T>(items: T[], nameOf: (item: T) => string, folderOf: (item: T) => string): Map<T, SoundNameParts> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = folderOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const out = new Map<T, SoundNameParts>();
  for (const list of groups.values()) {
    const prefixes = sharedPrefixLengths(list.map(nameOf));
    list.forEach((item, i) => out.set(item, parseSoundName(nameOf(item), prefixes[i])));
  }
  return out;
}
