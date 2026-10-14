// Every value that shapes how an export sounds, in one place, so a new genre is a new object here and not a hunt through the code.
//
// A preset sets:
//   1. Loudness   how loud each sound type sits against the others: every file is peak-normalized and the Koala volume knob brings it to its type's target.
//   2. Pad EQ     a highpass, and optionally a high-shelf cut, on each pad by sound type (Koala's per-pad EQ).
//   3. Buses      the effects on the Kick and Melodic buses (clipper, EQ), and the 808 fade-in that stands in for a sidechain.
//   4. Master     the master chain, in order.
//
// To add a genre: copy HEAVY_WARM_HIP_HOP, change what you want (every field says what it does and its valid range), add it to MIX_PRESETS
// and point ACTIVE_MIX_PRESET at it. Nothing else reads a number from anywhere else. The full list with advice is in docs/mix-presets.md.
//
// Koala's plugin and parameter names and limits are in docs/koala-mixer-reference.md. src/audio/mixerChain.test.ts checks every plugin
// value in a preset against the ranges Koala showed, so an out-of-range edit fails the tests.
import type { CategoryId } from "./classify";

/** Koala plugin parameters by Koala's own names (dB, Hz, ms, 0 to 1 fractions, 0/1 for buttons). */
export type PluginParams = Record<string, number>;

/** A plugin as it goes into a mixer slot. Master effects are written in the order given. */
export interface PluginSpec {
  name: string;
  parameters: PluginParams;
}

/** Per-pad EQ: a highpass (Koala pad EQ low band) and optionally the gain of its high shelf (high band, 8 kHz). */
export interface PadEq {
  /** Highpass frequency in Hz, 20 to 20000. Higher thins the pad and leaves more low end to the kick and bass. */
  highpassHz: number;
  /** High-shelf gain in dB, -18 to +18. Negative is warmer and darker, positive brighter. Leave out to keep the pad's own. */
  highShelfDb?: number;
}

export interface MixPreset {
  id: string;
  name: string;
  loudness: {
    /**
     * Where each sound type sits, as the loudest-200 ms loudness (LUFS, K-weighted) the sound reaches once the Koala volume knob has been
     * applied to its peak-normalized file. The files are never turned down in the audio: the knob (0 dB or below) does it. The lower the
     * number, the further back the type sits. A type whose file is already quieter than its target stays at 0 dB.
     */
    targetLufs: Record<CategoryId, number>;
  };
  /** Koala's tone knob (a tilt EQ, 0 = the middle) by sound type. A type that is not listed keeps the tone it came with. */
  padTone: Partial<Record<CategoryId, number>>;
  /** Per-pad EQ by sound type. A type that is not listed keeps the EQ it came with. */
  padEq: Partial<Record<CategoryId, PadEq>>;
  /** Per-pad EQ of the chop section pads (acapella and synced mode): a highpass that keeps them off the bass. */
  sectionEq: PadEq;
  buses: {
    /** CLIPPER on the Kick bus (bus A). Threshold also sets the curve: near 0 dB is a hard clip, low (-6 or less) a soft S-curve. */
    kickClipper: {
      /** Drive into the clip, dB, -36 to +36. More is more clipping. */
      input: number;
      /** Where clipping starts and how soft it is, dB, about -35 to 0. Lower is softer and also lowers the kick's peak level. */
      threshold: number;
      /** Level after the clip, dB, -36 to 0. It can only turn the kick down. */
      output: number;
      /** 1 = HQ (oversampled, less aliasing, more CPU), 0 = off. */
      oversample: number;
    };
    /**
     * The 808s are not sidechained. Instead each gets a soft fade-in as long as the kick's main transient (the time its envelope stays within
     * `withinDb` of its peak, see kickTransient.ts), kept between `minMs` and `maxMs`, so the kick's hit shows through.
     */
    fade808: { withinDb: number; minMs: number; maxMs: number };
    /** EQ on the Melodic bus (bus D): lo = low shelf, mid = bell, hi = high shelf (measured; gain 0 is flat). */
    melodicEq: PluginParams;
  };
  /**
   * Master chains written, in this order, into an empty master strip (5 slots at most), one per MasterStyle. EQ bands: lo = highpass,
   * mid = bell, hi = high shelf; freq 20 to 20000 Hz, gain -18 to +18 dB, Q 0.5 to 10.
   */
  master: Record<MasterStyle, PluginSpec[]>;
}

/**
 * The two master chains a preset carries. "dynamic" keeps the transients (aims at the reference's 12 dB peak-to-loudness ratio);
 * "loud" is squashed for about -9 LUFS integrated (ratio about 9 dB). The menu's Master chain switch writes the chosen one.
 */
export type MasterStyle = "dynamic" | "loud";
export const MASTER_STYLES: { id: MasterStyle; name: string }[] = [
  { id: "dynamic", name: "Dynamic (punchy, about -13 LUFS)" },
  { id: "loud", name: "Loud (squashed, about -9 LUFS)" },
];

/** Where the kick sits after its knob, in LUFS: the reference every other type is measured from (the knob only turns down). */
const KICK_LUFS = -13;
/** Each sound type's level in dB under the kick (see HEAVY_WARM_HIP_HOP.loudness). */
const DB_UNDER_KICK: Record<CategoryId, number> = {
  kick: 0,
  bass: 1, bassLoop: 1,
  snare: 3, clap: 4,
  vox: 5, voxLoop: 6,
  melodic: 7, melodicLoop: 8, drumLoop: 7, other: 8,
  openHat: 9, perc: 9, cymbal: 10, closedHat: 10,
  percLoop: 11, fx: 11, fxLoop: 12,
};
const TARGET_LUFS = Object.fromEntries(Object.entries(DB_UNDER_KICK).map(([type, under]) => [type, KICK_LUFS - under])) as Record<CategoryId, number>;

/** Heavy and warm hip-hop and trap: the kick and 808 lead, the top end is tucked back, the master is pushed and glued. */
export const HEAVY_WARM_HIP_HOP: MixPreset = {
  id: "heavy-warm-hip-hop",
  name: "Heavy and warm hip-hop",
  loudness: {
    // Trap and hip-hop balance, written as dB under the kick so the whole mix moves with one number. Measured on the 200 ms window of a peak-normalized
    // file, so these are the levels after the knob (the knob only ever turns a sound down; a file already under its target stays at 0 dB).
    //   0 dB          kick: the reference. The 808 and bass loops sit 1 dB under it (more sustained energy, the sub leads without burying the kick).
    //   -3 to -4 dB   snare and clap: cracking on top of the kick, as loud as they are in a trap mix; rims are snares.
    //   -5 to -6 dB   vocals and vocal loops: chops that sit on top of the melody.
    //   -7 to -8 dB   melodic one-shots and loops, drum loops and "other": the bed under the drums.
    //   -9 to -10 dB  perc, hats and cymbals: present and crisp, not harsh (the master shelf and the per-pad highpass keep them smooth).
    //   -11 to -12 dB perc loops and FX.
    targetLufs: TARGET_LUFS,
  },
  padTone: { snare: -0.1 }, // slightly under the middle: a touch darker
  sectionEq: { highpassHz: 150 }, // above the bass and 808 fundamentals, below the voice
  padEq: {
    // Highpasses only: the warmth on the top end is the master chain's 8 kHz shelf, so a second shelf here would cut the same band twice.
    closedHat: { highpassHz: 300 }, // clear of the 808
    openHat: { highpassHz: 300 },
    cymbal: { highpassHz: 250 },
    perc: { highpassHz: 200 },
    clap: { highpassHz: 200 },
    snare: { highpassHz: 120 },
    vox: { highpassHz: 120 },
    fx: { highpassHz: 200 },
    // melodic and melodicLoop are not listed: the Melodic bus EQ already shelves their low end (-6 dB below 150 Hz), so a pad highpass would cut it twice
    percLoop: { highpassHz: 150 },
    // kick, bass and drumLoop are not listed on purpose: they carry the low end
  },
  buses: {
    kickClipper: { input: 4, threshold: -6, output: 0, oversample: 1 }, // about 9 dB of drive into a soft clip
    fade808: { withinDb: 6, minMs: 4, maxMs: 30 }, // very subtle: just room for the kick's transient
    melodicEq: {
      "lo freq": 150, "lo gain": -6, "lo Q": 0.7, // low SHELF (measured; it is not a highpass, and gain 0 is flat): -6 dB below 150 Hz leaves the low end to the kick and bass
      "mid freq": 1016.1063842773438, "mid gain": 0, "mid Q": 0.5, // untouched
      "hi freq": 8000, "hi gain": -2, "hi Q": 0.5, // slight shelf cut: warmer
    },
  },
  master: {
    // DYNAMIC: transients through, a gentle glue, a limiter that only just works.
    dynamic: [
      {
        name: "EQ",
        parameters: {
          "lo freq": 20, "lo gain": 0, "lo Q": 0.5, // rumble filter only, so the sub is kept
          "mid freq": 70, "mid gain": 2.5, "mid Q": 0.7, // bell: the weight. Move freq to choose where the low end is pushed
          "hi freq": 8000, "hi gain": -3, "hi Q": 0.5, // broad shelf cut: the warmth. More negative is darker
        },
      },
      // DRIVE: parallel saturation. drive 0 to 36 dB, mix 0 to 1, out -90 to 0 dB, oversample 1 = HQ
      { name: "DRIVE", parameters: { drive: 6, mix: 0.3, out: 0, oversample: 1 } },
      // COMPRESSOR: slow attack lets the transients through. threshold about -42 to -1.7 dB, ratio 1 to 100, attack 0.01 to 30 ms,
      // release 10 to 1200 ms, makeup 0/1 (auto make-up gain), visual 0/1 (display only)
      { name: "COMPRESSOR", parameters: { threshold: -12, ratio: 2, attack: 20, release: 200, makeup: 0, visual: 0 } },
      // CLIPPER: shaves the peaks before the limiter. input -36 to 36 dB, threshold about -35 to 0 dB (also the curve's softness), output -36 to 0 dB, oversample 1 = HQ
      { name: "CLIPPER", parameters: { input: 0, output: 0, threshold: -1.5, oversample: 1 } },
      // LIMITER: gain is INPUT gain into the limiter, -18 to +18 dB (the master loudness knob), attack 1.5 to 6 ms, release 60 to 1000 ms.
      // Measured (round 3c): at -1 dB the groove peaked at -4.65 dBFS with the limiter idle and a peak-to-loudness ratio of 13.5 dB. Gain moves peak and loudness
      // together until a peak reaches the ceiling (+4.65 dB), and the reference's ratio is 12.2 dB, so +6 dB (about 1.3 dB of limiting) is the estimate. Correct it from a render.
      { name: "LIMITER", parameters: { attack: 1.5, release: 100, gain: 6 } },
    ],
    // LOUD: about -9 LUFS integrated, a peak-to-loudness ratio of about 9 dB. Everything here is an estimate until a render measures it (scripts/analyzeMixRender.py).
    loud: [
      {
        name: "EQ",
        parameters: {
          "lo freq": 20, "lo gain": 0, "lo Q": 0.5,
          "mid freq": 70, "mid gain": 2, "mid Q": 0.7, // a little less push than dynamic: the squash adds its own weight
          "hi freq": 8000, "hi gain": -3, "hi Q": 0.5,
        },
      },
      { name: "DRIVE", parameters: { drive: 8, mix: 0.35, out: 0, oversample: 1 } }, // more saturation: it thickens and shaves peaks before the dynamics stage
      { name: "COMPRESSOR", parameters: { threshold: -16, ratio: 3, attack: 10, release: 120, makeup: 0, visual: 0 } }, // lower, firmer and faster: it glues the groove tight and pulls the quiet parts up
      { name: "CLIPPER", parameters: { input: 3, output: 0, threshold: -3, oversample: 1 } }, // drives the master into a harder clip, trading transient peaks for loudness
      { name: "LIMITER", parameters: { attack: 1.5, release: 61, gain: 7 } }, // fastest release (Koala's minimum is 60.008 ms), and the clipper has already lifted the average by about 3 dB, so less gain than the dynamic chain would need for -9 LUFS (+9 with no clipper drive)
    ],
  },
};

/** Every preset by id, for a menu later. */
export const MIX_PRESETS: Record<string, MixPreset> = { [HEAVY_WARM_HIP_HOP.id]: HEAVY_WARM_HIP_HOP };

/** The preset the export and the loudness balance use. Point this at another entry of MIX_PRESETS to change genre. */
export const ACTIVE_MIX_PRESET: MixPreset = HEAVY_WARM_HIP_HOP;
