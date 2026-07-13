import { getAudioContext } from "./decode";

/**
 * Harmonic content (Fourier sine coefficients, harmonic 1..64) of the
 * user-supplied "CthulhuTone" single-cycle waveform — a sawtooth-shaped
 * cycle (linear ramp, sharp reset; measured RMS ≈ 0.58, matching a pure
 * sawtooth's ≈1/√3). Extracted once via a DFT of the source WAV; the real
 * (cosine) part came out ~1e-4, negligible noise for a waveform symmetric
 * about its reset point, so only the imaginary/sine series is kept. Used
 * to build a native `PeriodicWave` — playable at any frequency, unlike the
 * source sample itself which is only one fixed (sub-audio) cycle length.
 */
const DRONE_HARMONICS = [
  0, -0.710019, 0.329808, -0.193347, 0.119786, -0.072946, 0.041196, -0.019274, 0.004633, 0.004549, -0.009432, 0.01116,
  -0.010566, 0.008542, -0.005719, 0.002743, 0.000002, -0.002154, 0.0036, -0.004248, 0.004206, -0.003569, 0.002566,
  -0.001358, 0.000179, 0.000849, -0.001574, 0.001974, -0.00201, 0.001756, -0.001259, 0.000649, 0.000001, -0.000567,
  0.001002, -0.001236, 0.001279, -0.001124, 0.000835, -0.000445, 0.000042, 0.000337, -0.000619, 0.000791, -0.000821,
  0.000735, -0.000537, 0.000284, 0.000001, -0.000256, 0.000463, -0.000579, 0.00061, -0.000543, 0.000409, -0.000218,
  0.000017, 0.000179, -0.000328, 0.000424, -0.000443, 0.000402, -0.000296, 0.000159, 0,
];

let cachedWave: PeriodicWave | null = null;

/** The drone waveform, shared across every oscillator that plays it (a `PeriodicWave` is reusable across nodes). */
export function getDroneWave(): PeriodicWave {
  if (!cachedWave) {
    const ctx = getAudioContext();
    const zeros = new Float32Array(DRONE_HARMONICS.length);
    cachedWave = ctx.createPeriodicWave(zeros, new Float32Array(DRONE_HARMONICS), { disableNormalization: false });
  }
  return cachedWave;
}

/** Creates (but does not start) an oscillator voiced with the drone waveform. */
export function createDroneOscillator(): OscillatorNode {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(getDroneWave());
  return osc;
}
