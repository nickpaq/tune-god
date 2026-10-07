// Tempo, bar-1 position and key of a whole song. Everything here is a suggestion for the chop editor: the user checks the grid
// against the waveform and nudges it, because a cut that is a few milliseconds out cannot be fixed once the sections are rendered.
import { fft } from "../classify";

/** The song is analysed at about this rate: plenty for beats and harmony, and four times less audio to chew through. */
const ANALYSIS_RATE = 11025;
const FRAME = 512;
const HOP = 64;
const MIN_BPM = 60;
const MAX_BPM = 200;
/** A spectral peak counts as a note when it is this many times louder than the bins around it. */
const PEAK_PROMINENCE = 4;

/** The mono mix of a song. */
export function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return Float32Array.from(channelData[0]);
  const out = new Float32Array(channelData[0].length);
  for (const data of channelData) for (let i = 0; i < out.length; i++) out[i] += data[i];
  const scale = 1 / channelData.length;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/** Averages groups of samples: a crude low-pass and decimation, good enough for finding beats and notes. */
function decimate(mono: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return mono;
  const out = new Float32Array(Math.floor(mono.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += mono[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

export interface Onsets {
  /** Positive spectral change per frame over the whole spectrum. */
  flux: Float32Array;
  /** The same for the bass only (a kick or a bass note lands on the bar's first beat more often than anything else does). */
  low: Float32Array;
  hopSeconds: number;
  /** Seconds from a frame's index times the hop to where its onset is felt: half a window. */
  frameOffsetSeconds: number;
}

/** How strongly the sound changes, frame by frame (log-compressed spectral flux). */
export function onsetStrength(x: Float32Array, rate: number): Onsets {
  const frames = Math.max(0, Math.floor((x.length - FRAME) / HOP));
  const flux = new Float32Array(frames);
  const low = new Float32Array(frames);
  const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  const bins = FRAME / 2;
  const topBin = Math.min(bins, Math.round(4000 / (rate / FRAME)));
  const lowBin = Math.max(2, Math.round(200 / (rate / FRAME)));
  let previous = new Float64Array(bins);
  let current = new Float64Array(bins);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = x[f * HOP + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    let lowSum = 0;
    for (let k = 1; k < topBin; k++) {
      current[k] = Math.log1p((30 * 4 * Math.hypot(re[k], im[k])) / FRAME);
      if (f > 0) {
        const rise = current[k] - previous[k];
        if (rise > 0) {
          sum += rise;
          if (k < lowBin) lowSum += rise;
        }
      }
    }
    flux[f] = sum;
    low[f] = lowSum;
    [previous, current] = [current, previous];
  }
  return { flux, low, hopSeconds: HOP / rate, frameOffsetSeconds: FRAME / 2 / rate };
}

/** Subtracts a local average so steady loudness does not count as rhythm, and keeps only what rises above it. */
function emphasize(flux: Float32Array, hopSeconds: number): Float32Array {
  const half = Math.max(1, Math.round(0.4 / hopSeconds));
  const out = new Float32Array(flux.length);
  const prefix = new Float64Array(flux.length + 1);
  for (let i = 0; i < flux.length; i++) prefix[i + 1] = prefix[i] + flux[i];
  for (let i = 0; i < flux.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(flux.length, i + half + 1);
    out[i] = Math.max(0, flux[i] - (prefix[b] - prefix[a]) / (b - a));
  }
  return out;
}

export interface TempoGuess {
  bpm: number;
  /** 0..1: how clearly this tempo stands out. */
  confidence: number;
}

/** The likeliest tempos, best first. A song heard at half or double speed is the usual mistake, so those are always worth offering. */
export function tempoCandidates(flux: Float32Array, hopSeconds: number, low?: Float32Array): TempoGuess[] {
  const minLag = Math.max(2, Math.floor(60 / (MAX_BPM * hopSeconds)));
  const maxLag = Math.ceil(60 / (MIN_BPM * hopSeconds));
  const autocorrelation = (source: Float32Array) => {
    const x = emphasize(source, hopSeconds);
    const acf = new Float64Array(maxLag * 4 + 2);
    for (let lag = minLag; lag < acf.length && lag < x.length / 2; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < x.length; i++) sum += x[i] * x[i + lag];
      acf[lag] = sum / (x.length - lag);
    }
    const top = acf.reduce((m, v) => Math.max(m, v), 0);
    return top > 0 ? acf.map((v) => v / top) : acf;
  };
  // The whole spectrum says where the rhythm is; the bass says where the beat is (hats between the beats would otherwise double the tempo).
  const whole = autocorrelation(flux);
  const bass = low ? autocorrelation(low) : null;
  const acf = whole.map((v, i) => v + (bass ? 1.5 * bass[i] : 0));
  // A beat period is also a period at two and four times its length, so those add to its score.
  const score = new Float64Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * hopSeconds);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.8) ** 2);
    score[lag] = (acf[lag] + 0.5 * acf[lag * 2] + 0.25 * acf[lag * 4]) * (0.5 + 0.5 * prior);
    best = Math.max(best, score[lag]);
  }
  if (best <= 0) return [];
  const peaks: { lag: number; value: number }[] = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (score[lag] > score[lag - 1] && score[lag] >= score[lag + 1] && score[lag] > 0.15 * best) peaks.push({ lag, value: score[lag] });
  }
  peaks.sort((a, b) => b.value - a.value);
  const chosen: TempoGuess[] = [];
  for (const { lag, value } of peaks) {
    // Parabolic interpolation puts the peak between lags.
    const a = score[lag - 1];
    const b = score[lag];
    const c = score[lag + 1];
    const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
    const bpm = 60 / ((lag + shift) * hopSeconds);
    if (chosen.some((g) => Math.abs(g.bpm - bpm) / bpm < 0.03)) continue;
    chosen.push({ bpm, confidence: value / best });
    if (chosen.length >= 4) break;
  }
  return chosen;
}

/** A value read between frames. */
function at(x: Float32Array, position: number): number {
  const i = Math.floor(position);
  if (i < 0 || i + 1 >= x.length) return 0;
  const f = position - i;
  return x[i] * (1 - f) + x[i + 1] * f;
}

export interface BeatGrid {
  /** Seconds between beats, from a straight-line fit through every beat found. */
  periodSeconds: number;
  /** Time of beat number `k` is `originSeconds + k * periodSeconds`, k from 0. */
  originSeconds: number;
  /** How many beats were found where the grid said they would be, 0..1. */
  coverage: number;
}

/**
 * Lays a beat grid over the onsets: the best phase for the first guess of the tempo, then a straight-line fit through the
 * onset nearest every predicted beat, so a tempo that is a fraction of a BPM out is corrected by hundreds of beats of evidence.
 */
export function fitBeatGrid(onsets: Onsets, bpm: number): BeatGrid | null {
  const x = emphasize(onsets.flux, onsets.hopSeconds);
  if (x.length < 8) return null;
  let period = 60 / bpm / onsets.hopSeconds; // frames
  let origin = 0;
  let bestScore = -1;
  for (let phase = 0; phase < period; phase += 0.5) {
    let sum = 0;
    for (let p = phase; p < x.length - 1; p += period) sum += at(x, p);
    if (sum > bestScore) {
      bestScore = sum;
      origin = phase;
    }
  }
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  let coverage = 0;
  for (let pass = 0; pass < 4; pass++) {
    const found: { k: number; frame: number; weight: number }[] = [];
    const radius = Math.max(1, Math.round(0.12 * period));
    const beats = Math.floor((x.length - 1 - origin) / period);
    for (let k = 0; k <= beats; k++) {
      const predicted = origin + k * period;
      let peak = -1;
      let peakFrame = -1;
      for (let i = Math.max(1, Math.round(predicted) - radius); i <= Math.min(x.length - 2, Math.round(predicted) + radius); i++) {
        if (x[i] > peak) {
          peak = x[i];
          peakFrame = i;
        }
      }
      if (peakFrame < 0 || peak < 1.5 * mean) continue;
      // Parabolic interpolation for a position between frames.
      const a = x[peakFrame - 1];
      const b = x[peakFrame];
      const c = x[peakFrame + 1];
      const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
      found.push({ k, frame: peakFrame + Math.max(-0.5, Math.min(0.5, shift)), weight: peak });
    }
    if (found.length < 4) return null;
    coverage = found.length / (beats + 1);
    // Weighted straight line through (k, frame), dropping the worst misses on the later passes.
    let use = found;
    for (let round = 0; round < 2; round++) {
      let sw = 0;
      let sk = 0;
      let sf = 0;
      let skk = 0;
      let skf = 0;
      for (const p of use) {
        sw += p.weight;
        sk += p.weight * p.k;
        sf += p.weight * p.frame;
        skk += p.weight * p.k * p.k;
        skf += p.weight * p.k * p.frame;
      }
      const denominator = sw * skk - sk * sk;
      if (denominator === 0) return null;
      period = (sw * skf - sk * sf) / denominator;
      origin = (sf - period * sk) / sw;
      use = found.filter((p) => Math.abs(p.frame - (origin + p.k * period)) < 0.05 * period);
      if (use.length < 4) return null;
    }
  }
  return {
    periodSeconds: period * onsets.hopSeconds,
    originSeconds: origin * onsets.hopSeconds + onsets.frameOffsetSeconds,
    coverage,
  };
}

export interface Downbeat {
  /** Which beat of the grid (k mod beatsPerBar) opens each bar. */
  phase: number;
  /** 0..1: how much more bass weight that beat carries than the next best. */
  confidence: number;
}

/** How hard the bass (`low`) and the rest of the sound (`all`) hit on every beat of the grid, from the last beat before 0 that is still in the music's first moments. */
function beatStrengths(onsets: Onsets, grid: BeatGrid): { k: number; low: number; all: number }[] {
  const lowAll = emphasize(onsets.low, onsets.hopSeconds);
  const fluxAll = emphasize(onsets.flux, onsets.hopSeconds);
  const first = Math.ceil((-0.3 * grid.periodSeconds - grid.originSeconds) / grid.periodSeconds);
  const beats = Math.floor((onsets.flux.length * onsets.hopSeconds - grid.originSeconds) / grid.periodSeconds);
  const out: { k: number; low: number; all: number }[] = [];
  for (let k = first; k <= beats; k++) {
    const frame = (grid.originSeconds - onsets.frameOffsetSeconds + k * grid.periodSeconds) / onsets.hopSeconds;
    // The strongest frame within a few around the beat, so a little timing slack does not lose the hit.
    let low = 0;
    let all = 0;
    for (let d = -2; d <= 2; d++) {
      low = Math.max(low, at(lowAll, frame + d));
      all = Math.max(all, at(fluxAll, frame + d));
    }
    out.push({ k, low, all });
  }
  return out;
}

/**
 * The first beat (its number on the grid, which may be -1 for a hit at the very start) that is a big bass hit: most of the way up to a strong kick of the
 * song. Producers put the first big kick on the 1. Null when the song has no bass hits to speak of.
 */
export function firstBigBeat(onsets: Onsets, grid: BeatGrid): number | null {
  const beats = beatStrengths(onsets, grid);
  const sorted = beats.map((b) => b.low).sort((x, y) => x - y);
  const strong = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const hit = strong > 0 ? beats.find((b) => b.low >= 0.6 * strong) : undefined;
  return hit ? hit.k : null;
}

/** Which of the `beatsPerBar` beats is beat 1: the one the bass lands on hardest. */
export function pickDownbeat(onsets: Onsets, grid: BeatGrid, beatsPerBar: number): Downbeat {
  const sums = new Float64Array(beatsPerBar);
  const counts = new Float64Array(beatsPerBar);
  for (const { k, low, all } of beatStrengths(onsets, grid)) {
    if (k < 0) continue;
    sums[k % beatsPerBar] += low + 0.5 * all;
    counts[k % beatsPerBar]++;
  }
  const means = Array.from(sums, (s, i) => (counts[i] ? s / counts[i] : 0));
  const order = means.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const best = order[0];
  const second = order[1] ?? { v: 0 };
  return { phase: best.i, confidence: best.v > 0 ? Math.max(0, Math.min(1, (best.v - second.v) / best.v)) : 0 };
}

/**
 * Where bar 1 goes: the first bar line (from the grid and the beat found to open the bar) whose downbeat is a big peak, at least half as strong as the
 * song's typical downbeat. Intros are made of small, soft onsets that the first loud-ish frame would mistake for the start. Seconds from the start of the file.
 */
export function firstBigBar(onsets: Onsets, grid: BeatGrid, phase: number, beatsPerBar: number): number {
  const lowAll = emphasize(onsets.low, onsets.hopSeconds);
  const fluxAll = emphasize(onsets.flux, onsets.hopSeconds);
  const bar = grid.periodSeconds * beatsPerBar;
  const origin = grid.originSeconds + phase * grid.periodSeconds;
  const end = onsets.flux.length * onsets.hopSeconds;
  const first = Math.ceil((-0.3 * grid.periodSeconds - origin) / bar);
  const last = Math.floor((end - origin) / bar);
  const strengths: number[] = [];
  for (let b = first; b <= last; b++) {
    const frame = (origin + b * bar - onsets.frameOffsetSeconds) / onsets.hopSeconds;
    let low = 0;
    let all = 0;
    for (let d = -2; d <= 2; d++) {
      low = Math.max(low, at(lowAll, frame + d));
      all = Math.max(all, at(fluxAll, frame + d));
    }
    strengths.push(low + 0.5 * all);
  }
  const typical = [...strengths].sort((a, b) => a - b)[Math.floor(strengths.length / 2)] ?? 0;
  const index = typical > 0 ? strengths.findIndex((v) => v >= 0.5 * typical) : -1;
  return origin + (first + Math.max(0, index)) * bar;
}

/**
 * Moves a position onto the sound's real attack. The beat grid is accurate to a few milliseconds, but the first sample of
 * a kick is what a cut should land on. Looks within `radius` frames of `center` for the sharpest rise in loudness.
 */
export function snapToAttack(mono: Float32Array, center: number, radius: number, minContrast = 0): number {
  const smooth = 8;
  let best = -Infinity;
  let at = Math.round(center);
  let level = 0;
  const from = Math.max(smooth, Math.round(center) - radius);
  const to = Math.min(mono.length - smooth - 1, Math.round(center) + radius);
  for (let i = from; i <= to; i++) {
    let before = 0;
    let after = 0;
    for (let j = 1; j <= smooth; j++) {
      before += Math.abs(mono[i - j]);
      after += Math.abs(mono[i + j - 1]);
    }
    const rise = after - before;
    level += after;
    if (rise > best) {
      best = rise;
      at = i;
    }
  }
  // With a contrast asked for, a rise that is no bigger than the window's own level is noise or a swell, not an attack: stay where the caller pointed.
  const count = Math.max(1, to - from + 1);
  if (minContrast > 0 && best < minContrast * (level / count)) return Math.round(center);
  return at;
}

export interface KeyGuess {
  /** The tonic: 0 = C ... 11 = B. */
  pc: number;
  minor: boolean;
  /** 0..1: how far the best key stands above the next best. */
  confidence: number;
}

// Krumhansl-Kessler key profiles: how much each note belongs in a major or a minor key, from the tonic up.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** How much of each of the twelve notes the song holds, over the whole song, corrected for a song that is tuned off A=440. */
export function chromaOf(x: Float32Array, rate: number): Float64Array {
  const size = 4096;
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const first = Math.ceil(65 / (rate / size));
  const last = Math.floor(2000 / (rate / size));
  const spectrum = new Float64Array(size / 2);
  const total = new Float64Array(size / 2);
  for (let start = 0; start + size <= x.length; start += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = x[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let frameMax = 0;
    for (let k = Math.max(1, first - 12); k <= Math.min(size / 2 - 1, last + 12); k++) {
      spectrum[k] = Math.hypot(re[k], im[k]);
      if (k >= first && k <= last) frameMax = Math.max(frameMax, spectrum[k]);
    }
    if (frameMax <= 0) continue;
    // Each frame counts by its own loudness only a little, so a quiet verse weighs about as much as a loud chorus.
    for (let k = first; k <= last; k++) {
      // Only peaks that stand well above the bins around them are notes: noise (hats, the body of a snare) has peaks everywhere, but none that rise like a held note.
      if (!(spectrum[k] > spectrum[k - 1] && spectrum[k] >= spectrum[k + 1])) continue;
      let around = 0;
      let count = 0;
      for (let j = Math.max(1, k - 12); j <= Math.min(size / 2 - 1, k + 12); j++) {
        if (Math.abs(j - k) <= 2) continue;
        around += spectrum[j];
        count++;
      }
      if (spectrum[k] > PEAK_PROMINENCE * (around / count)) total[k] += Math.sqrt(spectrum[k] / frameMax);
    }
  }
  const binHz = rate / size;
  // The song's tuning: the weighted average distance of its peaks from the nearest note of A=440.
  let sx = 0;
  let sy = 0;
  for (let k = first; k <= last; k++) {
    if (!total[k]) continue;
    const midi = 69 + 12 * Math.log2((k * binHz) / 440);
    const angle = 2 * Math.PI * (midi - Math.round(midi));
    sx += total[k] * Math.cos(angle);
    sy += total[k] * Math.sin(angle);
  }
  const detune = Math.atan2(sy, sx) / (2 * Math.PI);
  const chroma = new Float64Array(12);
  for (let k = first; k <= last; k++) {
    if (!total[k]) continue;
    const midi = 69 + 12 * Math.log2((k * binHz) / 440) - detune;
    chroma[((Math.round(midi) % 12) + 12) % 12] += total[k];
  }
  return chroma;
}

/** The likeliest key, from a song's chroma (index 0 = C). */
export function keyOfChroma(chroma: ArrayLike<number>): KeyGuess {
  const scores: { pc: number; minor: boolean; value: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = (profile: number[]) => profile.map((_, i) => profile[(i - tonic + 12) % 12]);
    scores.push({ pc: tonic, minor: false, value: correlation(chroma, rotated(MAJOR)) });
    scores.push({ pc: tonic, minor: true, value: correlation(chroma, rotated(MINOR)) });
  }
  scores.sort((a, b) => b.value - a.value);
  const best = scores[0];
  // The relative major or minor shares all its notes, so it is no real rival: compare with the best key that is neither.
  const relativePc = best.minor ? (best.pc + 3) % 12 : (best.pc + 9) % 12;
  const rival = scores.find((s) => !(s.pc === best.pc && s.minor === best.minor) && !(s.pc === relativePc && s.minor !== best.minor)) ?? scores[1];
  return { pc: best.pc, minor: best.minor, confidence: Math.max(0, Math.min(1, (best.value - rival.value) / Math.max(0.01, Math.abs(best.value)))) };
}

export interface SongAnalysis {
  bpm: number;
  /** Other tempos worth a try (usually half and double). */
  tempoAlternatives: number[];
  /** Position of bar 1 beat 1, in seconds from the start of the file. May be negative. */
  downbeatSeconds: number;
  /** 0..1 each: the app shows low numbers as a warning to check the grid. */
  confidence: { tempo: number; grid: number; downbeat: number; key: number };
  key: KeyGuess;
}

/** Tempo, bar 1 and key of a song, from its mono mix. Null when no beat could be found. */
export function analyzeSong(mono: Float32Array, sampleRate: number, beatsPerBar: number): SongAnalysis | null {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  const x = decimate(mono, factor);
  const rate = sampleRate / factor;
  const onsets = onsetStrength(x, rate);
  const candidates = tempoCandidates(onsets.flux, onsets.hopSeconds, onsets.low);
  if (!candidates.length) return null;
  const tempo = candidates[0];
  const grid = fitBeatGrid(onsets, tempo.bpm);
  if (!grid) return null;
  const downbeat = pickDownbeat(onsets, grid, beatsPerBar);

  // The first bar line whose downbeat is a big hit, so a quiet intro of pads, risers or ghost notes does not count as where the music starts.
  // When the bass does not clearly favour one beat (a syncopated kick pattern ties two), the first big hit of the song is taken as the 1.
  const first = downbeat.confidence < 0.5 ? firstBigBeat(onsets, grid) : null;
  const phase = first === null ? downbeat.phase : ((first % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const rough = firstBigBar(onsets, grid, phase, beatsPerBar);
  const snapped = snapToAttack(mono, rough * sampleRate, Math.round(0.03 * sampleRate)) / sampleRate;

  const key = keyOfChroma(chromaOf(x, rate));
  const bpm = 60 / grid.periodSeconds;
  return {
    bpm,
    tempoAlternatives: [bpm / 2, bpm * 2].filter((b) => b >= 40 && b <= 240),
    downbeatSeconds: snapped,
    confidence: { tempo: tempo.confidence, grid: grid.coverage, downbeat: downbeat.confidence, key: key.confidence },
    key,
  };
}
