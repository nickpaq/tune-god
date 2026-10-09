import { fft } from "../classify";
/** Phase-vocoder stretch at original pitch, with a blended repeat seam for sustained audition. */
export function stretchPreview(
  data: Float32Array[],
  sampleRate: number,
  seconds = 4,
): Float32Array[] {
  const available = data[0]?.length ?? 0;
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  if (!available) return data.map(() => new Float32Array(frames));
  const n = available < 1024 ? 512 : 1024,
    hop = n / 4;
  const window = Float64Array.from(
    { length: n },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n),
  );
  const sourceCount = Math.max(2, Math.ceil(available / hop) + 1);
  const outputCount = Math.ceil(frames / hop) + 1;
  return data.map((channel) => {
    const spectra = Array.from({ length: sourceCount }, (_, frame) => {
      const re = Float64Array.from(
        { length: n },
        (_, i) => (channel[frame * hop + i - n / 2] ?? 0) * window[i],
      );
      const im = new Float64Array(n);
      fft(re, im);
      return {
        magnitude: re.map((r, k) => Math.hypot(r, im[k])),
        phase: re.map((r, k) => Math.atan2(im[k], r)),
      };
    });
    const phases = spectra[0].phase.slice();
    const output = new Float32Array(frames),
      weights = new Float32Array(frames);
    for (let frame = 0; frame < outputCount; frame++) {
      const source = (frame / Math.max(1, outputCount - 1)) * (sourceCount - 1);
      const a = Math.min(sourceCount - 2, Math.floor(source)),
        mix = source - a;
      const re = new Float64Array(n),
        im = new Float64Array(n);
      for (let k = 1; k <= n / 2; k++) {
        const magnitude =
          spectra[a].magnitude[k] * (1 - mix) +
          spectra[a + 1].magnitude[k] * mix;
        re[k] = magnitude * Math.cos(phases[k]);
        im[k] = magnitude * Math.sin(phases[k]);
        if (k < n / 2) {
          re[n - k] = re[k];
          im[n - k] = -im[k];
        } else im[k] = 0;
        const expected = (2 * Math.PI * k * hop) / n;
        const delta = spectra[a + 1].phase[k] - spectra[a].phase[k] - expected;
        phases[k] +=
          expected + delta - 2 * Math.PI * Math.round(delta / (2 * Math.PI));
      }
      // Inverse transform: conjugate, forward FFT, divide by N.
      for (let k = 0; k < n; k++) im[k] = -im[k];
      fft(re, im);
      for (let j = 0; j < n; j++) {
        const at = frame * hop + j - n / 2;
        if (at < 0 || at >= frames) continue;
        output[at] += (re[j] / n) * window[j];
        weights[at] += window[j] * window[j];
      }
    }
    let peak = 0;
    for (let i = 0; i < frames; i++) {
      output[i] = weights[i] > 1e-8 ? output[i] / weights[i] : 0;
      peak = Math.max(peak, Math.abs(output[i]));
    }
    const sourcePeak = channel.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
    const scale = peak > sourcePeak && peak > 0 ? sourcePeak / peak : 1;
    for (let i = 0; i < frames; i++) output[i] *= scale;
    const seam = Math.min(
      Math.round(sampleRate * 0.02),
      Math.floor(frames / 4),
    );
    for (let j = 0; j < seam; j++) {
      const mix = seam > 1 ? j / (seam - 1) : 1;
      output[frames - seam + j] =
        output[frames - seam + j] * (1 - mix) + output[j] * mix;
    }
    return output;
  });
}
