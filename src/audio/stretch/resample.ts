// Resample-based pitch shift, used for one-shots instead of Rubber Band.
// This is the classic "sampler pitch knob" approach: playback speed changes
// with pitch, so duration drifts proportionally and formants shift along
// with pitch — the trade for keeping transients perfectly crisp instead of
// running them through a phase-vocoder, which can smear percussive/plucked
// attacks.
//
// Interpolation is windowed-sinc (bandlimited), not linear: linear
// interpolation rolls off highs and — when pitching up — aliases, folding
// inharmonic mirror frequencies into the audible band. The sinc kernel's
// cutoff is scaled by the read speed so upward shifts stay alias-free.

/** Taps on each side of the read position (kernel length = 2 * HALF_TAPS). */
const HALF_TAPS = 16;
/** Fractional read positions are quantized to this many kernel phases. */
const PHASES = 512;

/**
 * Precomputes a Hann-windowed sinc kernel for every fractional phase, each
 * row normalized to unity DC gain. `cutoff` < 1 lowpasses the kernel for
 * anti-aliased upward shifts; 1 = plain bandlimited interpolation.
 */
function buildKernelTable(cutoff: number): Float32Array {
  const taps = 2 * HALF_TAPS;
  const table = new Float32Array(PHASES * taps);
  for (let p = 0; p < PHASES; p++) {
    const frac = p / PHASES;
    const row = p * taps;
    let sum = 0;
    for (let t = 0; t < taps; t++) {
      const k = t - HALF_TAPS + 1; // tap's integer offset from floor(srcPos)
      const d = frac - k; // distance from the exact read position, |d| <= HALF_TAPS
      const x = Math.PI * cutoff * d;
      const sinc = x === 0 ? 1 : Math.sin(x) / x;
      const window = 0.5 + 0.5 * Math.cos((Math.PI * d) / HALF_TAPS);
      const tap = cutoff * sinc * window;
      table[row + t] = tap;
      sum += tap;
    }
    for (let t = 0; t < taps; t++) table[row + t] /= sum;
  }
  return table;
}

/** > 1 = higher pitch (and shorter output), < 1 = lower pitch (and longer output). */
export function resamplePitchShift(channelData: Float32Array[], pitchScale: number): Float32Array[] {
  if (pitchScale === 1) return channelData;
  const inputLength = channelData[0].length;
  const outputLength = Math.max(1, Math.round(inputLength / pitchScale));

  // Pitching up reads the source faster than realtime, so everything above
  // the new effective Nyquist must be cut before it can alias.
  const cutoff = Math.min(1, 1 / pitchScale);
  const kernel = buildKernelTable(cutoff);
  const taps = 2 * HALF_TAPS;

  return channelData.map((input) => {
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcPos = i * pitchScale;
      const base = Math.floor(srcPos);
      const phase = Math.min(PHASES - 1, Math.round((srcPos - base) * PHASES));
      const row = phase * taps;
      let sum = 0;
      for (let t = 0; t < taps; t++) {
        // Edge taps clamp to the first/last sample rather than dropping out,
        // which keeps the kernel's unity gain intact at the boundaries.
        const idx = Math.min(inputLength - 1, Math.max(0, base + t - HALF_TAPS + 1));
        sum += input[idx] * kernel[row + t];
      }
      output[i] = sum;
    }
    return output;
  });
}
