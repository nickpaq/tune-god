// Simple resample-based pitch shift, used for one-shots instead of Rubber
// Band. This is the classic "sampler pitch knob" approach: playback speed
// changes with pitch (linear interpolation resample), so duration drifts
// proportionally and formants shift along with pitch — the trade for
// keeping transients perfectly crisp instead of running them through a
// phase-vocoder, which can smear percussive/plucked attacks.

/** > 1 = higher pitch (and shorter output), < 1 = lower pitch (and longer output). */
export function resamplePitchShift(channelData: Float32Array[], pitchScale: number): Float32Array[] {
  if (pitchScale === 1) return channelData;
  const inputLength = channelData[0].length;
  const outputLength = Math.max(1, Math.round(inputLength / pitchScale));

  return channelData.map((input) => {
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcPos = i * pitchScale;
      const idx0 = Math.min(Math.floor(srcPos), inputLength - 1);
      const idx1 = Math.min(idx0 + 1, inputLength - 1);
      const frac = srcPos - idx0;
      output[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
    }
    return output;
  });
}
