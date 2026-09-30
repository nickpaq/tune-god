// Sanity-checks the loudness meter and balancer on synthetic signals. Run: npx tsx scripts/checkLoudness.ts
import { measureLoudness, balanceMix, peakOf } from "../src/audio/loudness";

const SR = 48000;
const sine = (f: number, amp: number, secs: number) =>
  Float32Array.from({ length: Math.round(SR * secs) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR));

// BS.1770 reference: a 0 dBFS 997 Hz sine reads -3.01 LUFS mono, ~0 LUFS as identical stereo.
console.log("mono 0dBFS 997Hz (expect ~-3.0):", measureLoudness([sine(997, 1, 1)], SR)?.toFixed(2));
console.log("stereo same (expect ~0.0):", measureLoudness([sine(997, 1, 1), sine(997, 1, 1)], SR)?.toFixed(2));
console.log("-20 dB step (expect ~-20.0 diff):", (measureLoudness([sine(997, 0.1, 1)], SR)! - measureLoudness([sine(997, 1, 1)], SR)!).toFixed(2));
console.log("silence:", measureLoudness([new Float32Array(SR)], SR));

// A kick-like burst, a hat-like noise burst, a sustained pad, all with very different peaks.
const kick = Float32Array.from({ length: SR * 0.4 }, (_, i) => Math.exp(-i / (SR * 0.08)) * Math.sin(2 * Math.PI * 55 * (i / SR)) * 0.95);
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const hat = Float32Array.from({ length: SR * 0.1 }, (_, i) => Math.exp(-i / (SR * 0.02)) * rnd() * 0.9);
const pad = sine(440, 0.2, 2);
const inputs = [
  { channelData: [kick], sampleRate: SR, category: "kick" as const },
  { channelData: [hat], sampleRate: SR, category: "hat" as const },
  { channelData: [pad], sampleRate: SR, category: "melodic" as const },
];
const gains = balanceMix(inputs);
inputs.forEach((inp, i) => {
  const out = inp.channelData.map((c) => c.map((v) => v * 10 ** (gains[i] / 20)));
  console.log(inp.category, "gain", gains[i].toFixed(1), "dB, loudness", measureLoudness(out, SR)?.toFixed(1), "LUFS, peak", (20 * Math.log10(peakOf(out))).toFixed(1), "dBFS");
});
