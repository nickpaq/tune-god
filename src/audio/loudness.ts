// Perceptual loudness balancing. Each sample is measured with ITU-R BS.1770 K-weighting (the
// same filter EBU R128 / LUFS meters use), taking the loudest 200 ms window so short one-shots
// and long loops are compared fairly. The whole set is then gain-matched to a common loudness,
// so quiet sounds come up and loud ones come down, with a peak ceiling so nothing clips. The mix
// (a per-category trim: hats sit lower than kicks) is returned separately for the pad knobs.
import type { CategoryId } from "./classify";

/** Ear-like integration time: shorter hits read quieter, sustained sounds read at full level. */
const WINDOW_SECONDS = 0.2;
const HOP_SECONDS = 0.01;
/** Blocks quieter than this (LUFS) count as silence. */
const ABSOLUTE_GATE_LUFS = -70;

/** Pad-knob level (dB, never above 0) that turns equal loudness into a mix that sits like a real one. */
export const CATEGORY_TRIM_DB: Record<CategoryId, number> = {
  kick: 0,
  snare: 0,
  clap: 0,
  closedHat: -3,
  openHat: -3,
  perc: -3,
  bass: 0,
  melodic: -2,
  drumLoop: -2,
  percLoop: -3,
  melodicLoop: -2,
  vox: 0,
  fx: -4,
  other: 0,
};

/** Fraction of pads that may sit below the common loudness because their peak already reaches the ceiling. */
const PEAK_LIMITED_FRACTION = 0.1;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** BS.1770 stage 1 (head-related high shelf) and stage 2 (RLB high-pass) for any sample rate. */
function kWeightingFilters(fs: number): Biquad[] {
  const shelfDb = 3.999843853973347;
  const shelfQ = 0.7071752369554196;
  const shelfF = 1681.974450955533;
  let k = Math.tan((Math.PI * shelfF) / fs);
  const vh = 10 ** (shelfDb / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / shelfQ + k * k;
  const shelf: Biquad = {
    b0: (vh + (vb * k) / shelfQ + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / shelfQ + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / shelfQ + k * k) / a0,
  };
  const hpQ = 0.5003270373238773;
  const hpF = 38.13547087602444;
  k = Math.tan((Math.PI * hpF) / fs);
  a0 = 1 + k / hpQ + k * k;
  const highpass: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / hpQ + k * k) / a0 };
  return [shelf, highpass];
}

function applyBiquad(input: Float64Array, f: Biquad): Float64Array {
  const out = new Float64Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Loudest 200 ms window of the K-weighted signal, in LUFS (channel powers summed), or null when
 * the sample is silent. Windows running past the end are zero-padded, so a hit shorter than the
 * window is averaged over the full window like the ear does.
 */
export function measureLoudness(channelData: Float32Array[], sampleRate: number): number | null {
  const length = channelData[0].length;
  const filters = kWeightingFilters(sampleRate);
  const power = new Float64Array(length);
  for (const data of channelData) {
    let signal: Float64Array = Float64Array.from(data);
    for (const f of filters) signal = applyBiquad(signal, f);
    for (let i = 0; i < length; i++) power[i] += signal[i] * signal[i];
  }
  const prefix = new Float64Array(length + 1);
  for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i] + power[i];

  const win = Math.max(1, Math.round(WINDOW_SECONDS * sampleRate));
  const hop = Math.max(1, Math.round(HOP_SECONDS * sampleRate));
  let best = 0;
  for (let start = 0; start < length; start += hop) {
    const end = Math.min(length, start + win);
    best = Math.max(best, (prefix[end] - prefix[start]) / win);
  }
  const lufs = -0.691 + 10 * Math.log10(best);
  return best > 0 && lufs > ABSOLUTE_GATE_LUFS ? lufs : null;
}

export function peakOf(channelData: Float32Array[]): number {
  let peak = 0;
  for (const data of channelData) for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  return peak;
}

export interface BalanceInput {
  channelData: Float32Array[];
  sampleRate: number;
  category?: CategoryId;
}

export interface Balance {
  /** Gain to bake into each audio file, in dB. */
  gainDb: number[];
  /** Level for each pad's volume knob, in dB (0 or below). */
  knobDb: number[];
}

/**
 * Baked gain per input so all sit at the same perceived loudness with every peak at or below
 * `ceilingDb`, plus the knob level that mixes them. The common loudness is the highest at which
 * (nearly) every sample still fits under the ceiling; the few peakiest are held at the ceiling
 * instead of dragging the rest down. Silent samples get 0 dB and a 0 dB knob.
 */
export interface BalanceStats {
  loud: number | null;
  peakDb: number;
  category?: CategoryId;
}

/** Per-sample numbers balanceFromStats needs, so audio can be measured one sample at a time and dropped. */
export function balanceStats(input: BalanceInput): BalanceStats {
  return {
    loud: measureLoudness(input.channelData, input.sampleRate),
    peakDb: 20 * Math.log10(Math.max(peakOf(input.channelData), 1e-12)),
    category: input.category,
  };
}

export function balanceFromStats(stats: BalanceStats[], ceilingDb: number): Balance {
  const loud = stats.map((s) => s.loud);
  const peakDb = stats.map((s) => s.peakDb);
  // Highest common loudness each sample allows before its own peak would pass the ceiling.
  const limits: number[] = [];
  loud.forEach((l, i) => {
    if (l !== null) limits.push(ceilingDb - peakDb[i] + l);
  });
  if (!limits.length) return { gainDb: stats.map(() => 0), knobDb: stats.map(() => 0) };
  limits.sort((a, b) => a - b);
  const target = limits[Math.min(limits.length - 1, Math.floor(limits.length * PEAK_LIMITED_FRACTION))];
  return {
    gainDb: stats.map((_, i) => (loud[i] === null ? 0 : Math.min(target - (loud[i] as number), ceilingDb - peakDb[i]))),
    knobDb: stats.map((s, i) => (loud[i] === null ? 0 : CATEGORY_TRIM_DB[s.category ?? "other"])),
  };
}

export function balanceMix(inputs: BalanceInput[], ceilingDb: number): Balance {
  return balanceFromStats(inputs.map(balanceStats), ceilingDb);
}
