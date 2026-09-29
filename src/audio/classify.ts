// Guesses what kind of sound a sample is (kick, snare, bass, ...) so pads can be auto-coloured.
// Filename keywords win when present; otherwise a few cheap acoustic features (length, decay,
// spectral balance, whether a pitch was found) drive simple rules. No ML model or library.

export type CategoryId =
  | "kick"
  | "snare"
  | "hat"
  | "perc"
  | "bass"
  | "keys"
  | "synth"
  | "vocal"
  | "fx"
  | "loop"
  | "other";

export interface Category {
  id: CategoryId;
  label: string;
  /** Koala's own colour name for the category's pad colour. */
  koalaLabel: string;
  /** Hex Koala stores in sampler.json; written back on export. */
  koalaColor: string;
  /** How the colour looks on Koala's pads, used for the on-screen pads. */
  screenColor: string;
  /** Whether text drawn over `screenColor` should be dark. */
  lightPad: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "kick", label: "Kick", koalaLabel: "Red", koalaColor: "#FF586F", screenColor: "#EB6472", lightPad: false },
  { id: "snare", label: "Snare / Clap", koalaLabel: "Orange", koalaColor: "#EC7131", screenColor: "#DC7741", lightPad: false },
  { id: "hat", label: "Hi-hat / Cymbal", koalaLabel: "Yellow", koalaColor: "#FFE658", screenColor: "#FBE671", lightPad: true },
  { id: "perc", label: "Percussion", koalaLabel: "Dark Pink", koalaColor: "#CA3A7E", screenColor: "#BA457C", lightPad: false },
  { id: "bass", label: "Bass / 808", koalaLabel: "Dark Purple", koalaColor: "#302383", screenColor: "#2E247D", lightPad: false },
  { id: "keys", label: "Keys / Pluck", koalaLabel: "Light Blue", koalaColor: "#01D1FD", screenColor: "#60CDF8", lightPad: true },
  { id: "synth", label: "Synth / Pad", koalaLabel: "Purple", koalaColor: "#B758FF", screenColor: "#AB5CF5", lightPad: false },
  { id: "vocal", label: "Vocal", koalaLabel: "Green", koalaColor: "#47D604", screenColor: "#73D240", lightPad: true },
  { id: "fx", label: "FX / Riser", koalaLabel: "Seafoam", koalaColor: "#00FDB5", screenColor: "#73F8B9", lightPad: true },
  { id: "loop", label: "Loop / Texture", koalaLabel: "Dark Blue", koalaColor: "#5874FF", screenColor: "#5F73F6", lightPad: false },
  { id: "other", label: "Other", koalaLabel: "White", koalaColor: "#D9D9D9", screenColor: "#D8D8D8", lightPad: true },
];

export function categoryById(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

// Order matters: the first matching rule wins, so specific words come before generic ones.
const NAME_RULES: [CategoryId, RegExp][] = [
  ["kick", /\b(kick|kik|bd|bassdrum|bass drum)\b/],
  ["snare", /\b(snare|clap|rim|rimshot|snap|sd)\b/],
  ["hat", /\b(hi ?hat|hh|hat|hats|cymbal|crash|ride|shaker|open ?hat|closed ?hat)\b/],
  ["vocal", /\b(vocal|vocals|vox|voice|choir|acapella|chant|adlib|ad-lib|sung|singing)\b/],
  ["fx", /\b(fx|riser|sweep|impact|whoosh|transition|downlifter|uplifter|noise|glitch|foley|texture|swell)\b/],
  ["bass", /\b(808|bass|sub|reese)\b/],
  ["loop", /\b(loop|break|breakbeat|amen|ambience|ambient|atmos|drone)\b/],
  ["perc", /\b(tom|toms|perc|percussion|conga|bongo|tamb|tambourine|cowbell|clave|woodblock|timpani|drum)\b/],
  ["keys", /\b(piano|keys|key|bell|bells|pluck|guitar|harp|mallet|marimba|kalimba|rhodes|epiano|stab|vibraphone|glock|glockenspiel|celesta|chime)\b/],
  ["synth", /\b(pad|synth|lead|chord|chords|strings|string|organ|arp|saw|brass|horn|flute)\b/],
];

/** Category implied by a file name, or null when it has no telltale word. */
export function classifyByName(fileName: string): CategoryId | null {
  const name = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-.()[\]]+/g, " ")
    .toLowerCase();
  for (const [id, re] of NAME_RULES) if (re.test(name)) return id;
  return null;
}

/** In-place radix-2 FFT of `re`/`im` (length must be a power of two). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

interface Features {
  duration: number;
  /** Seconds from the peak until the level falls 20 dB. */
  decay: number;
  centroid: number;
  /** Share of spectral energy below 200 Hz and above 5 kHz. */
  low: number;
  high: number;
  /** 0 (tonal) .. 1 (noise-like). */
  flatness: number;
}

const FRAME = 4096;

function extractFeatures(mono: Float32Array, sampleRate: number): Features | null {
  let peak = 0;
  for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
  if (peak < 1e-4) return null;

  // 10 ms RMS envelope, for the decay time and to find the onset.
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const env: number[] = [];
  for (let i = 0; i < mono.length; i += hop) {
    let sum = 0;
    const end = Math.min(mono.length, i + hop);
    for (let j = i; j < end; j++) sum += mono[j] * mono[j];
    env.push(Math.sqrt(sum / (end - i)));
  }
  const envPeak = Math.max(...env);
  const peakIdx = env.indexOf(envPeak);
  let decayIdx = env.length - 1;
  for (let i = peakIdx; i < env.length; i++) {
    if (env[i] < envPeak * 0.1) {
      decayIdx = i;
      break;
    }
  }
  const onsetIdx = env.findIndex((v) => v > envPeak * 0.1);

  // Two Hann-windowed frames from the onset, magnitude spectra averaged.
  const mag = new Float64Array(FRAME / 2);
  const start = Math.max(0, onsetIdx) * hop;
  let frames = 0;
  for (let f = 0; f < 2; f++) {
    const offset = start + f * (FRAME / 2);
    if (offset + FRAME > mono.length && f > 0) break;
    const re = new Float64Array(FRAME);
    const im = new Float64Array(FRAME);
    for (let i = 0; i < FRAME; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
      re[i] = (mono[offset + i] ?? 0) * w;
    }
    fft(re, im);
    for (let k = 0; k < FRAME / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
    frames++;
  }
  if (!frames) return null;

  const binHz = sampleRate / FRAME;
  let total = 0;
  let weighted = 0;
  let low = 0;
  let high = 0;
  let logSum = 0;
  let n = 0;
  for (let k = 1; k < FRAME / 2; k++) {
    const p = (mag[k] / frames) ** 2;
    const hz = k * binHz;
    total += p;
    weighted += p * hz;
    if (hz < 200) low += p;
    if (hz > 5000) high += p;
    if (hz < 16000) {
      logSum += Math.log(p + 1e-12);
      n++;
    }
  }
  if (total <= 0) return null;
  const arithmetic = total / (FRAME / 2 - 1);
  return {
    duration: mono.length / sampleRate,
    decay: (decayIdx - peakIdx) * 0.01,
    centroid: weighted / total,
    low: low / total,
    high: high / total,
    flatness: Math.min(1, Math.exp(logSum / n) / (arithmetic + 1e-12)),
  };
}

/**
 * Best-guess category for a sample. `detectedMidi` is the pitch detector's result
 * (null/undefined = no clear pitch), which is the main tonal-vs-percussive signal.
 */
export function classifySample(
  mono: Float32Array,
  sampleRate: number,
  fileName: string,
  detectedMidi: number | null | undefined,
): CategoryId {
  const byName = classifyByName(fileName);
  if (byName) return byName;

  const f = extractFeatures(mono, sampleRate);
  if (!f) return "other";
  const pitched = detectedMidi != null;

  if (f.duration >= 4) return pitched ? "synth" : "loop";
  if (f.low > 0.7 && f.duration < 0.6 && f.decay < 0.5) return "kick";

  if (pitched) {
    if (detectedMidi < 50 && f.centroid < 600) return "bass";
    return f.decay > 0.8 ? "synth" : "keys";
  }

  if (f.duration < 1.5) {
    if (f.centroid > 6500 && f.high > 0.5) return "hat";
    if (f.low > 0.45 && f.centroid < 500) return "kick";
    if (f.flatness > 0.15 && f.centroid > 1500) return "snare";
    return "perc";
  }
  return f.flatness > 0.1 ? "fx" : "other";
}
