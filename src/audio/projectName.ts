import { KIND_WORDS, parseSoundName } from "./soundName";

/** Lower case letters and digits only, to compare a name with a file name however it is spaced or punctuated. */
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The file's own name: no folders, no extension. */
const stem = (fileName: string) => (fileName.split("/").pop() ?? fileName).replace(/\.[a-z0-9]{2,5}$/i, "");

/**
 * Names that can stand for a project, each taken from a real sample file name: the readable name the pack, tempo, key and type words leave behind
 * ("EUD_140_808_askari_Em.wav" gives "Askari"). A name is kept only if it really is in the file's name (checked letter for letter, however it is spaced),
 * has at least three letters and is not just a number. Each name appears once.
 */
export function candidateNames(fileNames: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const fileName of fileNames) {
    const original = stem(fileName);
    const name = parseSoundName(original).name.replace(/\s+/g, " ").trim();
    // Letters only: no digits, underscores or other symbols in a suggested name.
    if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) continue;
    if ((name.match(/[A-Za-z]/g)?.length ?? 0) < 3 || name.length > 40) continue;
    // Only type words and numbers ("Kick 1") is not a name.
    if (name.split(/[^A-Za-z0-9]+/).every((t) => !t || /^\d+$/.test(t) || KIND_WORDS.has(t.toLowerCase()))) continue;
    if (!squash(original).includes(squash(name))) continue;
    if (seen.has(squash(name))) continue;
    seen.add(squash(name));
    names.push(name);
  }
  return names;
}

/**
 * A random project name from the samples' own names that has not been used before (`used`, compared without regard to case or punctuation). When every
 * name has been used the whole list is open again; null when no sample has a usable name.
 */
export function pickProjectName(fileNames: string[], used: string[], random: () => number = Math.random): string | null {
  const names = candidateNames(fileNames);
  if (names.length === 0) return null;
  const taken = new Set(used.map(squash));
  const fresh = names.filter((name) => !taken.has(squash(name)));
  const pool = fresh.length > 0 ? fresh : names;
  return pool[Math.floor(random() * pool.length)];
}

/** The most used names remembered. */
export const MAX_USED_NAMES = 1000;

/** `name` added to the used list (kept once, newest last, at most MAX_USED_NAMES). */
export function rememberName(used: string[], name: string): string[] {
  const key = squash(name);
  return [...used.filter((u) => squash(u) !== key), name].slice(-MAX_USED_NAMES);
}
