// The a cappella chop needs two sounds in the project: the song, which the cuts are found on (it has the transients), and its vocal stem
// from Koala's stem split, which is what gets cut. The stem is found by its name: the song's file name, a space and VOCALS in capitals.
import type { Pad } from "../../components/PadPanel";

/** What Koala's stem split adds to the song's file name for the vocal stem. */
export const VOCALS_SUFFIX = " VOCALS";
/** The stem and the song must be this close in length (seconds): a stem whose start or end point was touched comes out a different length. */
export const STEM_LENGTH_TOLERANCE_S = 0.03;

const AUDIO_EXTENSION = /\.(wav|wave|aif|aiff|mp3|m4a|aac|flac|caf|ogg)$/i;

/** A sound's name without its extension. */
export function baseName(name: string): string {
  return name.replace(AUDIO_EXTENSION, "").trim();
}

/** The name the vocal stem of a song has: the song's file name, a space, VOCALS. */
export function vocalsNameFor(songName: string): string {
  return `${baseName(songName)}${VOCALS_SUFFIX}`;
}

/** True for a name that ends in the vocal stem's suffix. */
export function isVocalsName(name: string): boolean {
  return baseName(name).toUpperCase().endsWith(VOCALS_SUFFIX) && baseName(name).length > VOCALS_SUFFIX.length;
}

/** The song a vocal stem belongs to, by name (without extension). */
export function songNameOfVocals(vocalsName: string): string {
  const base = baseName(vocalsName);
  return base.slice(0, base.length - VOCALS_SUFFIX.length).trim();
}

const sameName = (a: string, b: string) => baseName(a).toLowerCase() === baseName(b).toLowerCase();
const seconds = (pad: Pad) => pad.channelData[0].length / pad.sampleRate;

export type StemCheck = { ok: true; song: Pad; vocals: Pad } | { ok: false; reason: "no-vocals" | "no-song" | "length"; message: string };

/**
 * Finds the song and its vocal stem for the sound that was tapped (either of them), and checks they can be used together. `pads` are the sounds
 * of the project (not placeholders, copies or section pads). The message says what to do about whatever is wrong.
 */
export function checkStems(tapped: Pad, pads: Pad[]): StemCheck {
  const touch = "Don't touch anything on the stem afterwards (its start and end points, and so on): it has to line up with the song to the sample, or the chops will not match the cuts.";
  let song = tapped;
  if (isVocalsName(tapped.name)) {
    // The vocal stem itself was tapped: the song is the sound it is named after.
    const found = pads.find((p) => p !== tapped && sameName(p.name, songNameOfVocals(tapped.name)));
    if (!found) {
      return {
        ok: false,
        reason: "no-song",
        message: `"${baseName(tapped.name)}" is a vocal stem, but its song, "${songNameOfVocals(tapped.name)}", is not in this project. The a cappella chop needs both: the song to find the cuts on, and the stem to cut. Add the song and try again.`,
      };
    }
    song = found;
  }
  const wanted = vocalsNameFor(song.name);
  const vocals = pads.find((p) => p !== song && sameName(p.name, wanted));
  if (!vocals) {
    return {
      ok: false,
      reason: "no-vocals",
      message: `There is no "${wanted}" in this project. Before chopping an a cappella, split the stems in Koala (open the song's pad and run Stem Split) so its vocal stem is in the project under that name. ${touch}`,
    };
  }
  const difference = Math.abs(seconds(song) - seconds(vocals));
  if (difference > STEM_LENGTH_TOLERANCE_S) {
    return {
      ok: false,
      reason: "length",
      message: `"${baseName(vocals.name)}" is ${seconds(vocals).toFixed(2)} s long but the song is ${seconds(song).toFixed(2)} s. They have to be exactly the same length: it looks like the start or end point of one of them was changed. Run the stem split again. ${touch}`,
    };
  }
  return { ok: true, song, vocals };
}
