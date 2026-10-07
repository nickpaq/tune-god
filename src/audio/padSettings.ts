// Koala's per-pad playback settings, chosen by sound category: mute group (`chokeGroup`, 0 = none), one-shot
// (`oneshot`), loop mode (`looping`) and release time in seconds (`release`). Categories not listed are left as they came.
import { isDrumCategory, type CategoryId } from "./classify";
import { ACTIVE_MIX_PRESET, type PadEq } from "./mixPresets";

export type { PadEq };

export interface PadPlayback {
  eq?: PadEq;
  chokeGroup?: number;
  oneShot?: boolean;
  /** Koala's loop mode (`looping`). */
  loop?: boolean;
  release?: number;
}

export const HAT_MUTE_GROUP = 5;
export const BASS_MUTE_GROUP = 6;
/** A medium release for pitched sounds (seconds), so notes stop without clicking but don't chop. */
export const MELODIC_RELEASE = 0.3;

/** Per-pad EQ by sound type comes from the active mix preset (src/audio/mixPresets.ts, `padEq`). */
const PAD_EQ = ACTIVE_MIX_PRESET.padEq;

/** A melodic loop is written this way whatever the Organize switch says. */
export const MELODIC_LOOP_PLAYBACK: PadPlayback = { oneShot: false, loop: false };

function basePlayback(category: CategoryId): PadPlayback | undefined {
  if (category === "closedHat" || category === "openHat") return { chokeGroup: HAT_MUTE_GROUP, oneShot: true };
  if (isDrumCategory(category)) return { oneShot: true };
  if (category === "bass") return { chokeGroup: BASS_MUTE_GROUP, oneShot: false, release: MELODIC_RELEASE };
  if (category === "melodicLoop") return MELODIC_LOOP_PLAYBACK;
  if (category === "melodic") return { oneShot: false, release: MELODIC_RELEASE };
  return undefined;
}

/** Playback settings and per-pad EQ for a sound type, or undefined when it keeps what it came with. */
export function playbackFor(category: CategoryId): PadPlayback | undefined {
  const eq = PAD_EQ[category];
  const play = basePlayback(category);
  return eq ? { ...play, eq } : play;
}
