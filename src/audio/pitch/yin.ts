// YIN fundamental frequency estimator (de Cheveigné & Kawahara, 2002).
// Chosen over deep-learning pitch trackers (e.g. CREPE) because it needs no
// shipped model weights, which matters for an installable iOS PWA with a
// tight storage quota, and it is highly accurate on clean monophonic
// one-shot samples, which is the only material this app ever tracks pitch on.

export interface YinOptions {
  sampleRate: number;
  /** Analysis window size in samples. Larger = better low-frequency resolution. */
  frameSize?: number;
  /** Hop between successive analysis frames, in samples. */
  hopSize?: number;
  /** Absolute threshold for the cumulative mean normalized difference function. */
  threshold?: number;
  minFrequency?: number;
  maxFrequency?: number;
}

export interface YinFrameResult {
  frequency: number;
  /** 0..1, higher = more confident (1 - normalized difference at the chosen lag). */
  confidence: number;
  timeSeconds: number;
}

const DEFAULTS: Required<Omit<YinOptions, "sampleRate">> = {
  frameSize: 2048,
  hopSize: 512,
  threshold: 0.15,
  minFrequency: 40,
  maxFrequency: 4000,
};

/** Runs YIN over a single frame, returning null if no pitch could be found. */
function yinFrame(
  buffer: Float32Array,
  sampleRate: number,
  threshold: number,
  minFrequency: number,
  maxFrequency: number,
): { frequency: number; confidence: number } | null {
  const maxLag = Math.min(buffer.length - 1, Math.floor(sampleRate / minFrequency));
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const diff = new Float32Array(maxLag + 1);

  // Step 1+2: difference function d(tau)
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < buffer.length - maxLag; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 3: cumulative mean normalized difference function
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (diff[tau] * tau) / runningSum;
  }

  // Step 4: absolute threshold — first local minimum below threshold
  let tauEstimate = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return null;

  // Step 5: parabolic interpolation around the chosen minimum for sub-sample precision
  const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
  const x2 = tauEstimate + 1 <= maxLag ? tauEstimate + 1 : tauEstimate;
  let betterTau = tauEstimate;
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = cmnd[x0];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }

  const frequency = sampleRate / betterTau;
  const confidence = 1 - cmnd[tauEstimate];
  return { frequency, confidence };
}

/** Runs YIN across a whole mono buffer, returning one estimate per hop. */
function yinTrack(mono: Float32Array, options: YinOptions): YinFrameResult[] {
  const { sampleRate } = options;
  const frameSize = options.frameSize ?? DEFAULTS.frameSize;
  const hopSize = options.hopSize ?? DEFAULTS.hopSize;
  const threshold = options.threshold ?? DEFAULTS.threshold;
  const minFrequency = options.minFrequency ?? DEFAULTS.minFrequency;
  const maxFrequency = options.maxFrequency ?? DEFAULTS.maxFrequency;

  const results: YinFrameResult[] = [];
  for (let start = 0; start + frameSize <= mono.length; start += hopSize) {
    const frame = mono.subarray(start, start + frameSize);
    const result = yinFrame(frame, sampleRate, threshold, minFrequency, maxFrequency);
    if (result) {
      results.push({
        frequency: result.frequency,
        confidence: result.confidence,
        timeSeconds: start / sampleRate,
      });
    }
  }
  return results;
}

/**
 * Picks the single most representative pitch for a (mostly monophonic) sample:
 * the median frequency among the most confident frames, which is robust to
 * attack transients and short pitch-bend at note-off.
 */
export function dominantPitch(mono: Float32Array, sampleRate: number): YinFrameResult | null {
  const track = yinTrack(mono, { sampleRate });
  if (track.length === 0) return null;

  const confident = track.filter((f) => f.confidence >= 0.5);
  const pool = confident.length > 0 ? confident : track;
  const sorted = [...pool].sort((a, b) => a.frequency - b.frequency);
  const median = sorted[Math.floor(sorted.length / 2)];
  const avgConfidence = pool.reduce((sum, f) => sum + f.confidence, 0) / pool.length;
  return { frequency: median.frequency, confidence: avgConfidence, timeSeconds: median.timeSeconds };
}
