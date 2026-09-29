// Resample-based pitch shift, used for one-shots instead of Rubber Band.
// This is the classic "sampler pitch knob" approach: playback speed changes
// with pitch, so duration drifts proportionally and formants shift along
// with pitch — the trade for keeping transients perfectly crisp instead of
// running them through a phase-vocoder, which can smear percussive/plucked
// attacks.
//
// Interpolation is a long Kaiser-windowed sinc (bandlimited), not linear:
// linear interpolation rolls off highs and — when pitching up — aliases,
// folding inharmonic mirror frequencies into the audible band. The kernel's
// cutoff is scaled by the read speed so upward shifts stay alias-free, and
// the kernel table is linearly interpolated between phases and accumulated
// in double precision, so the resampler's own error sits far below the
// 24-bit noise floor of the exported WAVs.

/** Taps on each side of the read position (kernel length = 2 * HALF_TAPS). */
const HALF_TAPS = 64;
/** Kaiser shape: ~100 dB stopband, transition band under 10% of Nyquist. */
const KAISER_BETA = 10;
/** Kernel phases across one sample; rows are linearly interpolated, so error is ~1e-7. */
const PHASES = 1024;

/** Zeroth-order modified Bessel function of the first kind (series expansion). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 60; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

/**
 * Precomputes a Kaiser-windowed sinc kernel for PHASES + 1 fractional phases, each row
 * normalized to unity DC gain. `cutoff` < 1 lowpasses the kernel for anti-aliased upward
 * shifts; 1 = plain bandlimited interpolation.
 */
function buildKernelTable(cutoff: number): Float32Array {
  const taps = 2 * HALF_TAPS;
  const table = new Float32Array((PHASES + 1) * taps);
  const norm = besselI0(KAISER_BETA);
  for (let p = 0; p <= PHASES; p++) {
    const frac = p / PHASES;
    const row = p * taps;
    const values = new Float64Array(taps);
    let sum = 0;
    for (let t = 0; t < taps; t++) {
      const k = t - HALF_TAPS + 1; // tap's integer offset from floor(srcPos)
      const d = frac - k; // distance from the exact read position, |d| <= HALF_TAPS
      const x = Math.PI * cutoff * d;
      const sinc = x === 0 ? 1 : Math.sin(x) / x;
      const r = d / HALF_TAPS;
      const window = Math.abs(r) >= 1 ? 0 : besselI0(KAISER_BETA * Math.sqrt(1 - r * r)) / norm;
      values[t] = cutoff * sinc * window;
      sum += values[t];
    }
    for (let t = 0; t < taps; t++) table[row + t] = values[t] / sum;
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
      const phasePos = (srcPos - base) * PHASES;
      const phase = Math.min(PHASES - 1, Math.floor(phasePos));
      const w = phasePos - phase;
      const rowA = phase * taps;
      const rowB = rowA + taps;
      const first = base - HALF_TAPS + 1;
      let sum = 0;
      if (first >= 0 && first + taps <= inputLength) {
        for (let t = 0; t < taps; t++) {
          sum += input[first + t] * (kernel[rowA + t] * (1 - w) + kernel[rowB + t] * w);
        }
      } else {
        // Beyond the ends the signal is treated as silence.
        for (let t = 0; t < taps; t++) {
          const idx = first + t;
          if (idx < 0 || idx >= inputLength) continue;
          sum += input[idx] * (kernel[rowA + t] * (1 - w) + kernel[rowB + t] * w);
        }
      }
      output[i] = sum;
    }
    return output;
  });
}
