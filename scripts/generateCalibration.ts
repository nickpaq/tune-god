// Builds docs/calibration/calibration.koala: a Koala project of test tones at exact, known pitches.
// Load it in the app with the key set to G: every pad's "Tuned" readout should match its expected
// shift (the pad names say what that is). A gap that is the same on every pad is a reference
// offset, not a detector fault. Run with: npx tsx scripts/generateCalibration.ts
import JSZip from "jszip";
import { mkdirSync, writeFileSync } from "node:fs";
import { encodeWav } from "../src/audio/wavEncode";
import { dominantPitch } from "../src/audio/pitch/yin";

const SR = 44100;
const DURATION = 2;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Tone {
  name: string;
  midi: number;
  /** Relative amplitudes of harmonics 1, 2, 3... */
  harmonics: number[];
  decay: number;
  /** Attack pitch offset in cents that relaxes to 0 (a sharp-attack pluck/synth). */
  glideCents?: number;
  glideTau?: number;
}

// Expected shift assumes the key is G (MIDI 67 = G4, pitch class 7).
const TONES: Tone[] = [
  { name: "A4 sine 440Hz", midi: 69, harmonics: [1], decay: 0 },
  { name: "A3 harmonic 220Hz", midi: 57, harmonics: [1, 0.5, 0.3, 0.15], decay: 1.5 },
  { name: "C4 pluck 261.63Hz", midi: 60, harmonics: [1, 0.6, 0.4, 0.2, 0.1], decay: 3 },
  { name: "G3 harmonic 196Hz", midi: 55, harmonics: [1, 0.5, 0.25], decay: 1 },
  { name: "E1 808 41.2Hz", midi: 28, harmonics: [1, 0.15], decay: 1 },
  { name: "F4 harmonic 349.23Hz", midi: 65, harmonics: [1, 0.7, 0.5, 0.3], decay: 2 },
  { name: "A4 sharp-attack pluck", midi: 69, harmonics: [1, 0.5, 0.3], decay: 3, glideCents: 30, glideTau: 0.15 },
  { name: "D5 harmonic 587.33Hz", midi: 74, harmonics: [1, 0.4, 0.2], decay: 2 },
];

function render(t: Tone): Float32Array {
  const n = SR * DURATION;
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const time = i / SR;
    const cents = (t.glideCents ?? 0) * Math.exp(-time / (t.glideTau ?? 1));
    phase += (2 * Math.PI * hz(t.midi + cents / 100)) / SR;
    let s = 0;
    t.harmonics.forEach((a, k) => (s += a * Math.sin((k + 1) * phase)));
    out[i] = 0.4 * s / t.harmonics.reduce((x, y) => x + y, 0) * (t.decay ? Math.exp(-time / t.decay) : 1);
  }
  return out;
}

const shiftToG = (midi: number) => {
  let d = (((67 - midi) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
};

const zip = new JSZip();
const samples: unknown[] = [];
const pads: unknown[] = [];
for (const [i, t] of TONES.entries()) {
  const data = render(t);
  const pitch = dominantPitch(data, SR);
  const got = pitch ? 69 + 12 * Math.log2(pitch.frequency / 440) : NaN;
  const shift = shiftToG(t.midi);
  const label = `${i + 1} ${t.name} expect ${shift >= 0 ? "+" : ""}${shift.toFixed(2)}st.wav`;
  console.log(`${label.padEnd(56)} detector error: ${((got - t.midi) * 100).toFixed(1)} cents`);
  const wav = encodeWav({ sampleRate: SR, channelData: [data], bitDepth: 24 });
  zip.file(`sampler/${i + 1}.wav`, await wav.arrayBuffer());
  samples.push({ id: i + 1, metadata: { originalPath: label } });
  pads.push({ pad: i, type: "sample", sampleId: i + 1 });
}
zip.file("sampler/sampler.json", JSON.stringify({ samples, pads }));
const buf = await zip.generateAsync({ type: "nodebuffer" });
mkdirSync("docs/calibration", { recursive: true });
writeFileSync("docs/calibration/calibration.koala", buf);
console.log("wrote docs/calibration/calibration.koala");
