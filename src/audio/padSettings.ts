// Koala's per-pad playback settings, chosen by sound category: mute group (`chokeGroup`, 0 = none), one-shot
// (`oneshot`) and release time in seconds (`release`). Categories not listed are left as they came.
import { isDrumCategory, type CategoryId } from "./classify";

/** A highpass on the pad's own EQ, and optionally a gentle cut or boost of the high shelf. */
export interface PadEq {
  highpassHz: number;
  highShelfDb?: number;
}

export interface PadPlayback {
  eq?: PadEq;
  chokeGroup?: number;
  oneShot?: boolean;
  release?: number;
}

export const HAT_MUTE_GROUP = 5;
export const BASS_MUTE_GROUP = 6;
/** A medium release for pitched sounds (seconds), so notes stop without clicking but don't chop. */
export const MELODIC_RELEASE = 0.3;

/**
 * Per-pad EQ by sound type, to keep the low end for the kick and bass: everything else is high-passed (never above 180 Hz,
 * the highest value seen on a Koala pad) and the hats and cymbals get a slight, warm cut on the high shelf.
 * Kicks, bass and the loops that carry them are left as they are.
 */
const PAD_EQ: Partial<Record<CategoryId, PadEq>> = {
  closedHat: { highpassHz: 180, highShelfDb: -2 },
  openHat: { highpassHz: 180, highShelfDb: -2 },
  cymbal: { highpassHz: 180, highShelfDb: -2 },
  perc: { highpassHz: 150 },
  clap: { highpassHz: 150 },
  snare: { highpassHz: 100 },
  vox: { highpassHz: 120 },
  fx: { highpassHz: 150 },
  melodic: { highpassHz: 80 },
  melodicLoop: { highpassHz: 80 },
  percLoop: { highpassHz: 120 },
};

function basePlayback(category: CategoryId): PadPlayback | undefined {
  if (category === "closedHat" || category === "openHat") return { chokeGroup: HAT_MUTE_GROUP, oneShot: true };
  if (isDrumCategory(category)) return { oneShot: true };
  if (category === "bass") return { chokeGroup: BASS_MUTE_GROUP, oneShot: false, release: MELODIC_RELEASE };
  if (category === "melodic") return { oneShot: false, release: MELODIC_RELEASE };
  return undefined;
}

/** Playback settings and per-pad EQ for a sound type, or undefined when it keeps what it came with. */
export function playbackFor(category: CategoryId): PadPlayback | undefined {
  const eq = PAD_EQ[category];
  const play = basePlayback(category);
  return eq ? { ...play, eq } : play;
}
