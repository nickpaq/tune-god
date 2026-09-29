// Measures the resampler on pure tones: passband gain and the level of everything that isn't
// the shifted tone (aliases, images, noise). Run with: npx tsx scripts/checkResample.ts
import { resamplePitchShift } from "../src/audio/stretch/resample";

const SR = 44100;
const N = SR * 2;

function analyze(freq: number, semitones: number) {
  const scale = 2 ** (semitones / 12);
  const input = new Float32Array(N);
  for (let i = 0; i < N; i++) input[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / SR);
  const [out] = resamplePitchShift([input], scale);
  const f = freq * scale;
  // Skip the edges, then least-squares fit sine+cosine at the expected frequency.
  const a = 4000, b = out.length - 4000;
  // Joint 2x2 least-squares fit, so a window that isn't a whole number of cycles doesn't bias it.
  let cc = 0, ssq = 0, cs = 0, yc = 0, ys = 0, energy = 0;
  for (let i = a; i < b; i++) {
    const ph = (2 * Math.PI * f * i) / SR;
    const c = Math.cos(ph), sn = Math.sin(ph);
    cc += c * c; ssq += sn * sn; cs += c * sn; yc += out[i] * c; ys += out[i] * sn;
    energy += out[i] * out[i];
  }
  const det = cc * ssq - cs * cs;
  const ca = (yc * ssq - ys * cs) / det;
  const sa = (ys * cc - yc * cs) / det;
  const amp = Math.hypot(ca, sa);
  let err = 0;
  for (let i = a; i < b; i++) {
    const ph = (2 * Math.PI * f * i) / SR;
    const d = out[i] - (ca * Math.cos(ph) + sa * Math.sin(ph));
    err += d * d;
  }
  const sigPow = energy;
  const resid = err;
  return { gainDb: 20 * Math.log10(amp / 0.5), residDb: 10 * Math.log10(Math.max(resid, 1e-30) / sigPow) };
}

for (const st of [-6, -2, 1, 3, 6]) {
  for (const freq of [1000, 8000, 16000, 19000]) {
    if (freq * 2 ** (st / 12) > 0.9 * (SR / 2)) continue;
    const r = analyze(freq, st);
    console.log(`${st >= 0 ? "+" : ""}${st} st  ${String(freq).padStart(5)} Hz  gain ${r.gainDb.toFixed(3)} dB  error ${r.residDb.toFixed(1)} dB`);
  }
}
