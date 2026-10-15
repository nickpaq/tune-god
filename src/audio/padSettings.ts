// Koala offers six choke groups. Product defaults: hats 1, cymbals 2, drum loops 3, chops 4, both bass Types 5, vocal loops 6. Melodic loops have no group.
// Loops use One Shot off and Stretch on; one-shots use One Shot on and Stretch off. Chops keep their own settings.
import { CATEGORY_BUS } from "./routing";
import { isDrumCategory, type CategoryId } from "./classify";
import { ACTIVE_MIX_PRESET, type PadEq } from "./mixPresets";

export type { PadEq };

/** Koala's stretch modes as the pad's `stretch` field, read from docs/calibration/stretch-all-modes.koala (pads in the order of the mode picker): Modern 1, Retro 2, Beats 3, Repitch 4, Cyclic 5. */
export const STRETCH_MODE = { modern: 1, retro: 2, beats: 3, repitch: 4, cyclic: 5 } as const;

export interface PadPlayback {
  /** Serialized Koala bus: 0–3, or -1 for Main. */
  bus?: number;
  eq?: PadEq;
  chokeGroup?: number;
  oneShot?: boolean;
  /** Koala's loop mode (`looping`). */
  loop?: boolean;
  /** Koala's release knob, 0 to 1 (1 = the maximum). */
  release?: number;
  /** Koala's tone knob, a tilt EQ with 0 in the middle. */
  tone?: number;
  /** Stretch off, or on in one of Koala's modes. Ordinary loops leave length detection to Koala; only chop exports set an explicit beat length. */
  stretch?: "off" | keyof typeof STRETCH_MODE;
}

export const HAT_MUTE_GROUP = 1;
export const CYMBAL_MUTE_GROUP = 2;
export const DRUM_LOOP_MUTE_GROUP = 3;
/** Reserved for the chops (acapella, synced, chopper); no sound type uses it. */
export const CHOP_MUTE_GROUP = 4;
export const BASS_MUTE_GROUP = 5;
export const VOX_LOOP_MUTE_GROUP = 6;
/** Koala's choke groups: 1 to 6. 0 is no group. */
export const MUTE_GROUPS = 6;
/** Release knob at its maximum. */
export const MELODIC_RELEASE = 1;

/** Per-pad EQ by sound type comes from the active mix preset (src/audio/mixPresets.ts, `padEq`), and so does the tone knob (`padTone`). */
const PAD_EQ = ACTIVE_MIX_PRESET.padEq;
const PAD_TONE = ACTIVE_MIX_PRESET.padTone;

/** A melodic loop is written this way whatever the Organize switch says. */
export const MELODIC_LOOP_PLAYBACK: PadPlayback = { chokeGroup: 0, oneShot: false, loop: false, stretch: "modern" };

function basePlayback(category: CategoryId): PadPlayback | undefined {
  if (category === "melodicLoop") return MELODIC_LOOP_PLAYBACK;
  if (category === "drumLoop" || category === "percLoop") return { chokeGroup: DRUM_LOOP_MUTE_GROUP, oneShot: false, loop: false, stretch: "beats" };
  if (category === "closedHat" || category === "openHat") return { chokeGroup: HAT_MUTE_GROUP, oneShot: true, loop: false, stretch: "off" };
  if (category === "cymbal") return { chokeGroup: CYMBAL_MUTE_GROUP, oneShot: true, loop: false, stretch: "off" };
  if (category === "vox" || category === "fx") return { chokeGroup: 0, oneShot: true, loop: false, stretch: "off" }; // not drums, though the classifier groups vox with them
  if (isDrumCategory(category)) return { chokeGroup: 0, oneShot: true, loop: false, stretch: "off" };
  if (category === "bassLoop") return { chokeGroup: BASS_MUTE_GROUP, oneShot: false, loop: false, stretch: "modern" };
  if (category === "voxLoop") return { chokeGroup: VOX_LOOP_MUTE_GROUP, oneShot: false, loop: false, stretch: "modern" };
  if (category === "fxLoop") return { chokeGroup: 0, oneShot: false, loop: false, stretch: "modern" };
  if (category === "bass") return { chokeGroup: BASS_MUTE_GROUP, oneShot: true, loop: false, stretch: "off" };
  if (category === "melodic") return { chokeGroup: 0, oneShot: true, loop: false, release: MELODIC_RELEASE, stretch: "off" };
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

/** Type defaults < configured Type settings < saved per-pad controls. Stretch key is a per-pad override. */
export function resolvePlayback(category: CategoryId, typeOverrides?: PadPlayback, padOverrides?: PadPlayback, stretch?: boolean): PadPlayback {
  const resolved: PadPlayback = { bus: CATEGORY_BUS[category], ...playbackFor(category), ...typeOverrides, ...padOverrides };
  if (stretch === false) resolved.stretch = "off";
  if (stretch === true && (!resolved.stretch || resolved.stretch === "off")) resolved.stretch = playbackFor(category)?.stretch === "beats" ? "beats" : "modern";
  return resolved;
}

/** The bar counts a loop's stretch length may take. */
export const LOOP_BARS = [2, 4, 8, 16] as const;

/** The nearest allowed bar count (compared on a log scale, so 5.5 bars is 4 or 8 by ratio, never 5 or 7). */
export function snapLoopBars(bars: number): number {
  if (!(bars > 0)) return LOOP_BARS[0];
  return LOOP_BARS.reduce((best, n) => (Math.abs(Math.log(bars / n)) < Math.abs(Math.log(bars / best)) ? n : best));
}

/** A loop's `stretchLength` in beats: its length at its own tempo (the name's, else the project's), snapped to 2, 4, 8 or 16 bars. */
export function loopStretchBeats(seconds: number, ownBpm: number | undefined, projectBpm: number, beatsPerBar: number): number {
  const bpm = ownBpm && ownBpm > 0 ? ownBpm : projectBpm;
  return snapLoopBars((seconds * bpm) / 60 / beatsPerBar) * beatsPerBar;
}
