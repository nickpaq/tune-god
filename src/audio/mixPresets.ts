// Every value that shapes how an export sounds, in one place, so a new genre is a new object here and not a hunt through the code.
//
// A preset sets:
//   1. Loudness   how loud each sound type sits against the others (pad knob trims, kick and bass lift, peak limits).
//   2. Pad EQ     a highpass, and optionally a high-shelf cut, on each pad by sound type (Koala's per-pad EQ).
//   3. Buses      the effects on the Kick, Bass and Melodic buses (clipper, sidechain, EQ).
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
     * Pad knob trim in dB (0 or below), applied after every sound is gain-matched to the same loudness. This is the mix: the
     * lower the number, the further back that type sits. 0 is as loud as a pad can go.
     */
    categoryTrimDb: Record<CategoryId, number>;
    /** Extra dB a type sits ABOVE the common loudness (before the trim). Raises the type and moves its peak up with it. */
    bonusDb: Partial<Record<CategoryId, number>>;
    /** Extra peak room in dB for a type on top of maxCrestDb. Positive lets it peak higher, negative holds the peak lower. */
    crestBonusDb: Partial<Record<CategoryId, number>>;
    /**
     * Most a sample's peak (knob trim included) may stand above the common loudness, in dB. Lower tames transients (snares peak less),
     * higher keeps them punchy. Typical 6 to 12.
     */
    maxCrestDb: number;
    /** Fraction of pads (0 to 1) allowed below the common loudness because their peak already hits the file ceiling. */
    peakLimitedFraction: number;
  };
  /** Per-pad EQ by sound type. A type that is not listed keeps the EQ it came with. */
  padEq: Partial<Record<CategoryId, PadEq>>;
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
    /** SIDECHAIN on the Bass bus (bus B), ducked by the Kick bus. */
    bassSidechain: {
      /** Level the kick must pass before the bass ducks, dB, -60 to 0. Lower ducks on quieter kicks. */
      threshold: number;
      /** How fast the bass comes back after each kick, ms, 10 to 1000. Short is tight, long pumps. */
      release: number;
      /** Level after ducking, dB, -12 to +12. Not the duck depth, which Koala does not expose. */
      output: number;
    };
    /** EQ on the Melodic bus (bus D): lo = low shelf, mid = bell, hi = high shelf (measured; gain 0 is flat). */
    melodicEq: PluginParams;
  };
  /**
   * Master chain written, in this order, into an empty master strip (5 slots at most). EQ bands: lo = highpass, mid = bell,
   * hi = high shelf; freq 20 to 20000 Hz, gain -18 to +18 dB, Q 0.5 to 10.
   */
  master: PluginSpec[];
}

/** Heavy and warm hip-hop and trap: the kick and 808 lead, the top end is tucked back, the master is pushed and glued. */
export const HEAVY_WARM_HIP_HOP: MixPreset = {
  id: "heavy-warm-hip-hop",
  name: "Heavy and warm hip-hop",
  loudness: {
    categoryTrimDb: {
      kick: 0, // the loudest thing in the mix
      bass: 0, // 808s level with the kick: this is most of the "heavy"
      snare: -2, // backbeat sits a little behind the kick
      clap: -3, // under the snare
      closedHat: -5, // hats and cymbals read bright on the meter, so they sit back (about 8 to 9 dB under the snare's peak in the calibration render)
      openHat: -4,
      cymbal: -3,
      perc: -5,
      melodic: -4,
      vox: -3,
      fx: -7,
      drumLoop: -3, // loops already hold several parts, so they sit under the one-shots they play with
      percLoop: -5,
      melodicLoop: -5,
      other: -3,
    },
    bonusDb: { kick: 4, bass: 4 }, // kick and bass lifted 4 dB over the common loudness
    crestBonusDb: { kick: 5, closedHat: -1, openHat: -1, cymbal: -1 }, // hats and cymbals held 1 dB lower so they never rival the snare. This cap, not the trim, is what held them down at -5/-4: with it, lowering the trim moves them and raising it does not
    maxCrestDb: 8,
    peakLimitedFraction: 0.1,
  },
  padEq: {
    closedHat: { highpassHz: 300, highShelfDb: -2 }, // highpass: clear of the 808; shelf: warmer
    openHat: { highpassHz: 300, highShelfDb: -2 },
    cymbal: { highpassHz: 250, highShelfDb: -2 },
    perc: { highpassHz: 200 },
    clap: { highpassHz: 200 },
    snare: { highpassHz: 120 },
    vox: { highpassHz: 120 },
    fx: { highpassHz: 200 },
    melodic: { highpassHz: 80 },
    melodicLoop: { highpassHz: 80 },
    percLoop: { highpassHz: 150 },
    // kick, bass and drumLoop are not listed on purpose: they carry the low end
  },
  buses: {
    kickClipper: { input: 4, threshold: -6, output: 0, oversample: 1 }, // about 9 dB of drive into a soft clip
    bassSidechain: { threshold: -17, release: 80, output: 0 }, // measured with the master chain off (probe-sidechain round 2, bass dB re no duck at +50 ms / deepest): -14: -2 to -3, -16: -7 / -8, -20: -14 / -20, -24: about -17 deepest. About 3.5 dB deeper per dB of threshold. Release 300 ms deepens it and takes 0.5 s to recover. -17 aims at a duck of about 8 to 10 dB that is back by 0.2 s
    melodicEq: {
      "lo freq": 150, "lo gain": -6, "lo Q": 0.7, // low SHELF (measured; it is not a highpass, and gain 0 is flat): -6 dB below 150 Hz leaves the low end to the kick and bass
      "mid freq": 1016.1063842773438, "mid gain": 0, "mid Q": 0.5, // untouched
      "hi freq": 8000, "hi gain": -2, "hi Q": 0.5, // slight shelf cut: warmer
    },
  },
  master: [
    {
      name: "EQ",
      parameters: {
        "lo freq": 20, "lo gain": 0, "lo Q": 0.5, // highpass at 20 Hz: only a rumble filter, so the sub is kept
        "mid freq": 70, "mid gain": 2.5, "mid Q": 0.7, // bell: the weight. Move freq to choose where the low end is pushed
        "hi freq": 8000, "hi gain": -3, "hi Q": 0.5, // broad shelf cut: the warmth. More negative is darker
      },
    },
    // DRIVE: parallel saturation. drive 0 to 36 dB, mix 0 to 1, out -90 to 0 dB, oversample 1 = HQ
    { name: "DRIVE", parameters: { drive: 6, mix: 0.3, out: 0, oversample: 1 } },
    // COMPRESSOR: slow attack lets the transients through. threshold about -42 to -1.7 dB, ratio 1 to 100, attack 0.01 to 30 ms,
    // release 10 to 1200 ms, makeup 0/1 (auto make-up gain), visual 0/1 (display only)
    { name: "COMPRESSOR", parameters: { threshold: -12, ratio: 2, attack: 20, release: 200, makeup: 0, visual: 0 } },
    // CLIPPER: shaves the peaks before the limiter. input -36 to 36 dB, threshold about -35 to 0 dB (also the curve's softness),
    // output -36 to 0 dB, oversample 1 = HQ
    { name: "CLIPPER", parameters: { input: 0, output: 0, threshold: -1.5, oversample: 1 } },
    // LIMITER: gain is INPUT gain into the limiter, -18 to +18 dB, so this is the master loudness knob. attack 1.5 to 6 ms, release 60 to 1000 ms.
    // Reference: the gold-standard mix has a 12 dB peak-to-loudness ratio (its absolute loudness is not known: it came through YouTube). At +3 dB our groove had 8.9 dB and at -1 dB 13.5 dB (round 3c) with the limiter idle (peak -4.65 dBFS). Gain moves peak and loudness together until a peak reaches the ceiling, so the ratio only
    // falls once the limiter works: +4.65 dB reaches the ceiling, about 1.3 dB more of limiting gives 12.2, so +6 dB (about -12.5 LUFS) was the estimate. The target is now -9 LUFS integrated (user choice; the ratio falls to about 9 dB as a result), so +9 dB, to be corrected from the next render. Tune it until a rendered groove measures about 12 dB (scripts/analyzeMixRender.py). Lower = more dynamics, higher = louder.
    { name: "LIMITER", parameters: { attack: 1.5, release: 100, gain: 9 } },
  ],
};

/** Every preset by id, for a menu later. */
export const MIX_PRESETS: Record<string, MixPreset> = { [HEAVY_WARM_HIP_HOP.id]: HEAVY_WARM_HIP_HOP };

/** The preset the export and the loudness balance use. Point this at another entry of MIX_PRESETS to change genre. */
export const ACTIVE_MIX_PRESET: MixPreset = HEAVY_WARM_HIP_HOP;
