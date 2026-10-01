// Koala's per-pad playback settings, chosen by sound category: mute group (`chokeGroup`, 0 = none), one-shot
// (`oneshot`) and release time in seconds (`release`). Categories not listed are left as they came.
import { isDrumCategory, type CategoryId } from "./classify";

export interface PadPlayback {
  chokeGroup?: number;
  oneShot?: boolean;
  release?: number;
}

export const HAT_MUTE_GROUP = 5;
export const BASS_MUTE_GROUP = 6;
/** A medium release for pitched sounds (seconds), so notes stop without clicking but don't chop. */
export const MELODIC_RELEASE = 0.3;

export function playbackFor(category: CategoryId): PadPlayback | undefined {
  if (category === "closedHat" || category === "openHat") return { chokeGroup: HAT_MUTE_GROUP, oneShot: true };
  if (isDrumCategory(category)) return { oneShot: true };
  if (category === "bass") return { chokeGroup: BASS_MUTE_GROUP, oneShot: false, release: MELODIC_RELEASE };
  if (category === "melodic") return { oneShot: false, release: MELODIC_RELEASE };
  return undefined;
}
