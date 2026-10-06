// The a cappella chop needs two sounds in the project: the song, which the cuts are found on (it has the transients), and its vocal stem
// from Koala's stem split, which is what gets cut. The stem is found by its pad's label: the song's label, a space and VOCALS in capitals.
import type { Pad } from "../../components/PadPanel";

/** What the vocal stem's label has after the song's label. */
export const VOCALS_SUFFIX = " VOCALS";
/** The stem and the song must be this close in length (seconds): a stem whose start or end point was touched comes out a different length. */
export const STEM_LENGTH_TOLERANCE_S = 0.03;

const AUDIO_EXTENSION = /\.(wav|wave|aif|aiff|mp3|m4a|aac|flac|caf|ogg)$/i;

/** A sound's name without its extension. */
export function baseName(name: string): string {
  return name.replace(AUDIO_EXTENSION, "").trim();
}

/** What a pad is called, for finding its stem: the label on the pad in Koala, or when it has none the sample's file name. */
export function padTitle(pad: Pad): string {
  return baseName(pad.label?.trim() ? pad.label : pad.name);
}

/** The label the vocal stem of a song has: the song's label, a space, VOCALS. */
export function vocalsNameFor(songTitle: string): string {
  return `${baseName(songTitle)}${VOCALS_SUFFIX}`;
}

/** True for a name that ends in the vocal stem's suffix. */
export function isVocalsName(name: string): boolean {
  return baseName(name).toUpperCase().endsWith(VOCALS_SUFFIX) && baseName(name).length > VOCALS_SUFFIX.length;
}

/** The song a vocal stem belongs to, by title. */
export function songNameOfVocals(vocalsTitle: string): string {
  const base = baseName(vocalsTitle);
  return base.slice(0, base.length - VOCALS_SUFFIX.length).trim();
}

const sameName = (a: string, b: string) => baseName(a).toLowerCase() === baseName(b).toLowerCase();
/** A pad answers to a title by its label, or by its sample's file name. */
const answersTo = (pad: Pad, title: string) => sameName(padTitle(pad), title) || sameName(pad.name, title);
const seconds = (pad: Pad) => pad.channelData[0].length / pad.sampleRate;

export type StemCheck = { ok: true; song: Pad; vocals: Pad } | { ok: false; reason: "no-vocals" | "no-song" | "length" | "no-pair"; message: string };

/** What the user is told when the project holds no song with its vocal stem. */
export const NEEDS_BOTH_MESSAGE = `The project needs both files to continue: a song, and its vocal stem labelled exactly like the song with VOCALS after it (for example "Night Drive" and "Night Drive VOCALS"). Run Stem Split in Koala on the song, keep both pads in the project, and try again.`;

/**
 * Finds the acapella's song and vocal stem in a project. Bank D's first two slots are checked first (`first` and `second`, the song and its
 * stem); when they do not hold the pair, `all` (every sound of the project, in the order to look) is searched for a pad labelled `{label}` and
 * another labelled `{label} VOCALS`. When there is no such pair the message says both files are needed; a pair whose lengths do not match says that.
 */
export function findAcapellaPair(first: Pad | undefined, second: Pad | undefined, all: Pad[]): StemCheck {
  if (first && second) {
    const direct = checkStems(first, [first, second]);
    if (direct.ok) return direct;
  }
  let problem: StemCheck | null = null;
  for (const pad of all) {
    if (!isVocalsName(padTitle(pad))) continue;
    const check = checkStems(pad, all);
    if (check.ok) return check;
    if (check.reason === "length" && !problem) problem = check;
  }
  return problem ?? { ok: false, reason: "no-pair", message: NEEDS_BOTH_MESSAGE };
}

/**
 * Finds the song and its vocal stem for the sound that was tapped (either of them), and checks they can be used together. `pads` are the sounds
 * of the project (not placeholders, copies or section pads). The message says what to do about whatever is wrong.
 */
export function checkStems(tapped: Pad, pads: Pad[]): StemCheck {
  const touch = "Don't touch anything on the stem afterwards (its start and end points, and so on): it has to line up with the song to the sample, or the chops will not match the cuts.";
  let song = tapped;
  if (isVocalsName(padTitle(tapped))) {
    // The vocal stem itself was tapped: the song is the pad it is named after.
    const found = pads.find((p) => p !== tapped && answersTo(p, songNameOfVocals(padTitle(tapped))));
    if (!found) {
      return {
        ok: false,
        reason: "no-song",
        message: `"${padTitle(tapped)}" is a vocal stem, but its song, "${songNameOfVocals(padTitle(tapped))}", is not in this project. The a cappella chop needs both: the song to find the cuts on, and the stem to cut. Add the song and try again.`,
      };
    }
    song = found;
  }
  const wanted = vocalsNameFor(padTitle(song));
  const vocals = pads.find((p) => p !== song && answersTo(p, wanted));
  if (!vocals) {
    return {
      ok: false,
      reason: "no-vocals",
      message: `There is no pad labelled "${wanted}" in this project. Before chopping an a cappella, split the stems in Koala (open the song's pad and run Stem Split) so its vocal stem is in the project, labelled like the song with VOCALS after it. ${touch}`,
    };
  }
  const difference = Math.abs(seconds(song) - seconds(vocals));
  if (difference > STEM_LENGTH_TOLERANCE_S) {
    return {
      ok: false,
      reason: "length",
      message: `"${padTitle(vocals)}" is ${seconds(vocals).toFixed(2)} s long but the song is ${seconds(song).toFixed(2)} s. They have to be exactly the same length: it looks like the start or end point of one of them was changed. Run the stem split again. ${touch}`,
    };
  }
  return { ok: true, song, vocals };
}
