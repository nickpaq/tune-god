// Grid drift correction. The detected tempo is a fraction of a BPM out, and a song that was not played to a click wanders, so a grid laid from the first
// downbeat slides off the hits it should sit on. The transient on the grid's first downbeat is taken as a template; the beats after it are searched for
// hits that look like it (normalised cross-correlation), following the hits as they drift. A straight line through the matches gives the exact tempo, and
// wherever the grid is more than `percent` of a beat from a confirmed match it is re-locked there (a new tempo segment, same tempo).
// Pure arithmetic on the mono audio so it can run in the worker and be tested.
import type { TapGrid, TempoSegment } from "./tapGrid";

/** A grid line further than this share of a beat (percent) from a confirmed hit is moved onto the hit. */
export const DRIFT_PERCENT = 2;
/** How alike a hit must be to the first downbeat's transient (0 to 1) to count as the same sound. */
const MIN_SIMILARITY = 0.6;
/** The template: this long from just before the attack. */
const TEMPLATE_S = 0.04;
const PRE_S = 0.003;
/** How far either side of where a hit is expected to look, as a share of a beat. */
const SEARCH = 0.15;
/** The tempo the hits give never strays further than this from the grid's (ratio). */
const MAX_TEMPO_CHANGE = 0.05;
/** The coarse search runs on audio decimated to about this rate. */
const COARSE_RATE = 5512;
/** Matches the running tempo estimate is taken from. */
const RECENT = 12;

export interface DriftFix {
  grid: TapGrid;
  /** Hits that matched the first downbeat (the first one included). */
  matches: number;
  /** Segments added where the grid had drifted past the limit. */
  relocks: number;
}

interface Hit {
  k: number;
  frame: number;
}

/** Block-averaged copy of `x` at 1/`factor` of the rate. */
function decimate(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += x[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

/** Zero-mean copy of `x[from, from+length)` and its norm. */
function templateOf(x: Float32Array, from: number, length: number): { t: Float32Array; norm: number } {
  const t = new Float32Array(length);
  let mean = 0;
  for (let i = 0; i < length; i++) mean += x[from + i];
  mean /= length;
  let energy = 0;
  for (let i = 0; i < length; i++) {
    t[i] = x[from + i] - mean;
    energy += t[i] * t[i];
  }
  return { t, norm: Math.sqrt(energy) };
}

/**
 * The grid with its tempo and phase corrected from the hits that sound like the one on its first downbeat. Returns the grid itself (and 0 matches) when the
 * first downbeat has no clear transient or fewer than four hits match.
 */
export function correctDrift(mono: Float32Array, grid: TapGrid, percent = DRIFT_PERCENT): DriftFix {
  const none: DriftFix = { grid, matches: 0, relocks: 0 };
  const rate = grid.sampleRate;
  const beat = grid.segments[0].beatFrames;
  const first = Math.round(grid.segments[0].frame);
  const startFull = first - Math.round(PRE_S * rate);
  const lengthFull = Math.round(TEMPLATE_S * rate);
  if (startFull < 0 || startFull + lengthFull >= mono.length || beat < 16) return none;

  const factor = Math.max(1, Math.floor(rate / COARSE_RATE));
  const coarse = decimate(mono, factor);
  const startCoarse = Math.round(startFull / factor);
  const lengthCoarse = Math.max(8, Math.round(lengthFull / factor));
  if (startCoarse + lengthCoarse >= coarse.length) return none;
  const coarseT = templateOf(coarse, startCoarse, lengthCoarse);
  const fullT = templateOf(mono, startFull, lengthFull);
  if (coarseT.norm < 1e-6 || fullT.norm < 1e-6) return none;

  // Running sums so the energy and mean of any window of the coarse audio cost nothing.
  const sum1 = new Float64Array(coarse.length + 1);
  const sum2 = new Float64Array(coarse.length + 1);
  for (let i = 0; i < coarse.length; i++) {
    sum1[i + 1] = sum1[i] + coarse[i];
    sum2[i + 1] = sum2[i] + coarse[i] * coarse[i];
  }
  const coarseScore = (p: number): number => {
    let dot = 0;
    for (let i = 0; i < lengthCoarse; i++) dot += coarseT.t[i] * coarse[p + i];
    const s1 = sum1[p + lengthCoarse] - sum1[p];
    const s2 = sum2[p + lengthCoarse] - sum2[p];
    const energy = s2 - (s1 * s1) / lengthCoarse;
    return energy <= 1e-12 ? 0 : dot / (coarseT.norm * Math.sqrt(energy));
  };
  const fullScore = (p: number): number => {
    let dot = 0;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < lengthFull; i++) {
      const v = mono[p + i];
      dot += fullT.t[i] * v;
      s1 += v;
      s2 += v * v;
    }
    const energy = s2 - (s1 * s1) / lengthFull;
    return energy <= 1e-12 ? 0 : dot / (fullT.norm * Math.sqrt(energy));
  };

  /** The frame of the attack of the best match for the template around `expected` (a frame), or null when nothing there is alike enough. */
  const find = (expected: number, radius: number): number | null => {
    const lo = Math.max(0, Math.round((expected - radius - (first - startFull)) / factor));
    const hi = Math.min(coarse.length - lengthCoarse - 1, Math.round((expected + radius - (first - startFull)) / factor));
    let best = -Infinity;
    let bestP = -1;
    for (let p = lo; p <= hi; p++) {
      const s = coarseScore(p);
      if (s > best) {
        best = s;
        bestP = p;
      }
    }
    if (bestP < 0 || best < MIN_SIMILARITY) return null;
    // Refine on the full-rate audio, then to a fraction of a frame by the parabola through the peak.
    const centre = bestP * factor;
    const from = Math.max(0, centre - 2 * factor);
    const to = Math.min(mono.length - lengthFull - 1, centre + 2 * factor);
    let top = -Infinity;
    let topP = -1;
    const scores = new Map<number, number>();
    for (let p = from; p <= to; p++) {
      const s = fullScore(p);
      scores.set(p, s);
      if (s > top) {
        top = s;
        topP = p;
      }
    }
    if (topP < 0) return null;
    const a = scores.get(topP - 1);
    const c = scores.get(topP + 1);
    let shift = 0;
    if (a !== undefined && c !== undefined && a - 2 * top + c < 0) shift = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / (a - 2 * top + c)));
    return topP + shift + (first - startFull);
  };

  // Follow the hits forward from the first downbeat: each search is centred where the last match and the running tempo say the next one is.
  const hits: Hit[] = [{ k: 0, frame: first }];
  const recent: Hit[] = [hits[0]];
  let estimate = beat;
  let last = hits[0];
  for (let k = 1; ; k++) {
    const expected = last.frame + (k - last.k) * estimate;
    if (expected + SEARCH * estimate + lengthFull >= mono.length) break;
    const frame = find(expected, SEARCH * estimate);
    if (frame === null) continue;
    last = { k, frame };
    hits.push(last);
    recent.push(last);
    if (recent.length > RECENT) recent.shift();
    if (recent.length >= 3) {
      // Slope of the recent hits against their line numbers.
      const n = recent.length;
      const mk = recent.reduce((t, h) => t + h.k, 0) / n;
      const mf = recent.reduce((t, h) => t + h.frame, 0) / n;
      const slope = recent.reduce((t, h) => t + (h.k - mk) * (h.frame - mf), 0) / recent.reduce((t, h) => t + (h.k - mk) ** 2, 0);
      estimate = Math.min(beat * (1 + MAX_TEMPO_CHANGE), Math.max(beat * (1 - MAX_TEMPO_CHANGE), slope));
    }
  }
  if (hits.length < 4) return none;

  // The tempo: the slope through the first downbeat (which stays where it is), dropping the hits that sit far off the line.
  let use = hits.slice(1);
  let fitted = beat;
  for (let round = 0; round < 3; round++) {
    const top = use.reduce((t, h) => t + h.k * (h.frame - first), 0);
    const bottom = use.reduce((t, h) => t + h.k * h.k, 0);
    if (bottom === 0) return none;
    fitted = top / bottom;
    const kept = hits.slice(1).filter((h) => Math.abs(h.frame - (first + h.k * fitted)) < (round === 0 ? 0.25 : 0.1) * beat);
    if (kept.length < 3) break;
    use = kept;
  }
  fitted = Math.min(beat * (1 + MAX_TEMPO_CHANGE), Math.max(beat * (1 - MAX_TEMPO_CHANGE), fitted));

  // Where the grid has drifted past the limit from a hit (confirmed by the next one the same way), it is put back on the hit.
  const limit = (percent / 100) * fitted;
  const segments: TempoSegment[] = [{ line: 0, frame: first, beatFrames: fitted }];
  let at = segments[0];
  const errorOf = (h: Hit) => h.frame - (at.frame + (h.k - at.line) * fitted);
  for (let i = 1; i < hits.length - 1; i++) {
    const e = errorOf(hits[i]);
    if (Math.abs(e) <= limit) continue;
    const next = errorOf(hits[i + 1]);
    if (Math.abs(next) <= limit || Math.sign(next) !== Math.sign(e)) continue;
    at = { line: hits[i].k, frame: hits[i].frame, beatFrames: fitted };
    segments.push(at);
  }
  return { grid: { ...grid, segments }, matches: hits.length, relocks: segments.length - 1 };
}
