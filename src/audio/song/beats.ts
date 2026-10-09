// Audio mixing and harmonic analysis. Automatic tempo detection lives in musicTempo.ts.
import { fft } from "../classify";

/** The song is analysed at about this rate: plenty for beats and harmony, and four times less audio to chew through. */
const ANALYSIS_RATE = 11025;
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

/** Harmonic analysis is independent of beat detection and manual grid anchors. */
export function analyzeSongKey(mono: Float32Array, sampleRate: number): KeyGuess {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  return keyOfChroma(chromaOf(decimate(mono, factor), sampleRate / factor));
}
