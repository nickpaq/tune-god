// Koala's per-pad playback settings, chosen by sound category. The rules (every export, whatever else is switched on):
// Mute (choke) groups, from the product spec: closed and open hat 1, cymbal 2, drum and perc loops 3, melodic loops 4, bass and 808 5, vox loops 6
// (reserved: vox loops have no category yet). Kick, snare, clap, perc, melodic one-shots, vox and FX have none. Chops take group 7 or above.
//   melodic loops   mute group 4, one-shot on, loop off, stretch on (Koala's modern mode), on bus D
//   melodic sounds  no mute group, one-shot off, release at its maximum, stretch off
//   drums           one-shot on, no mute group, loop off, stretch off (hats and cymbals keep their own mute groups); the snare's tone knob a touch under the middle
//   drum and perc loops   mute group 3, stretch on in Koala's beats mode
//   808 and bass    mute group 5, one-shot on, stretch off
//   vox and FX      one-shot on, no mute group, stretch off
// Stretch is on only for loops (and chops, which the chop modes write themselves); every one-shot is written with stretch off.
// Categories not listed are left as they came.
import { isDrumCategory, type CategoryId } from "./classify";
import { ACTIVE_MIX_PRESET, type PadEq } from "./mixPresets";

export type { PadEq };

/** Koala's stretch modes as the pad's `stretch` field, read from docs/calibration/stretch-all-modes.koala (pads in the order of the mode picker): Modern 1, Retro 2, Beats 3, Repitch 4, Cyclic 5. */
export const STRETCH_MODE = { modern: 1, retro: 2, beats: 3, repitch: 4, cyclic: 5 } as const;

export interface PadPlayback {
  eq?: PadEq;
  chokeGroup?: number;
  oneShot?: boolean;
  /** Koala's loop mode (`looping`). */
  loop?: boolean;
  /** Koala's release knob, 0 to 1 (1 = the maximum). */
  release?: number;
  /** Koala's tone knob, a tilt EQ with 0 in the middle. */
  tone?: number;
  /** Stretch off, or on in one of Koala's modes. A stretched pad also needs its length in beats (the export's `stretch` map). */
  stretch?: "off" | keyof typeof STRETCH_MODE;
}

export const HAT_MUTE_GROUP = 1;
export const CYMBAL_MUTE_GROUP = 2;
export const DRUM_LOOP_MUTE_GROUP = 3;
export const MELODIC_LOOP_MUTE_GROUP = 4;
export const BASS_MUTE_GROUP = 5;
/** Reserved for vox loops, which the classifier has no category for yet. */
export const VOX_LOOP_MUTE_GROUP = 6;
/** The first mute group the chops may use: 1 to 6 belong to the sound types. */
export const FIRST_FREE_MUTE_GROUP = 7;
/** Release knob at its maximum. */
export const MELODIC_RELEASE = 1;

/** Per-pad EQ by sound type comes from the active mix preset (src/audio/mixPresets.ts, `padEq`), and so does the tone knob (`padTone`). */
const PAD_EQ = ACTIVE_MIX_PRESET.padEq;
const PAD_TONE = ACTIVE_MIX_PRESET.padTone;

/** A melodic loop is written this way whatever the Organize switch says. */
export const MELODIC_LOOP_PLAYBACK: PadPlayback = { chokeGroup: MELODIC_LOOP_MUTE_GROUP, oneShot: true, loop: false, stretch: "modern" };

function basePlayback(category: CategoryId): PadPlayback | undefined {
  if (category === "melodicLoop") return MELODIC_LOOP_PLAYBACK;
  if (category === "drumLoop" || category === "percLoop") return { chokeGroup: DRUM_LOOP_MUTE_GROUP, oneShot: true, loop: false, stretch: "beats" };
  if (category === "closedHat" || category === "openHat") return { chokeGroup: HAT_MUTE_GROUP, oneShot: true, loop: false, stretch: "off" };
  if (category === "cymbal") return { chokeGroup: CYMBAL_MUTE_GROUP, oneShot: true, loop: false, stretch: "off" };
  if (category === "vox" || category === "fx") return { chokeGroup: 0, oneShot: true, stretch: "off" }; // not drums, though the classifier groups vox with them
  if (isDrumCategory(category)) return { chokeGroup: 0, oneShot: true, loop: false, stretch: "off" };
  if (category === "bass") return { chokeGroup: BASS_MUTE_GROUP, oneShot: true, stretch: "off" };
  if (category === "melodic") return { chokeGroup: 0, oneShot: false, release: MELODIC_RELEASE, stretch: "off" };
  return undefined;
}

/** Playback settings, per-pad EQ and tone for a sound type, or undefined when it keeps what it came with. */
export function playbackFor(category: CategoryId): PadPlayback | undefined {
  const eq = PAD_EQ[category];
  const tone = PAD_TONE[category];
  const play = basePlayback(category);
  return eq || tone !== undefined ? { ...play, ...(eq ? { eq } : {}), ...(tone !== undefined ? { tone } : {}) } : play;
}

/**
 * Koala's per-pad EQ (`pad.eq`: lo highpass, mid peaking, hi highshelf). Sets the highpass frequency and, when asked, the high shelf's
 * gain, keeping every other band setting the pad already has. A pad with no EQ gets Koala's defaults first.
 */
export function applyPadEq(pad: any, eq: PadEq): void {
  const base = { enabled: "true", lo: { type: "highpass", freq: 20, gain: -18, q: 1 }, mid: { type: "peaking", freq: 1000, gain: 0, q: 1 }, hi: { type: "highshelf", freq: 8000, gain: 0, q: 1 } };
  const cur = pad.eq ?? base;
  pad.eq = { ...base, ...cur, enabled: typeof cur.enabled === "boolean" ? true : "true", lo: { ...base.lo, ...cur.lo, freq: eq.highpassHz }, hi: { ...base.hi, ...cur.hi, ...(eq.highShelfDb !== undefined ? { gain: eq.highShelfDb } : {}) } };
}
