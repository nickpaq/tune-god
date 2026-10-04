// Guesses what kind of sound a sample is (kick, snare, bass, ...) so pads can be auto-coloured.
// Filename keywords win when present; otherwise a few cheap acoustic features (length, decay,
// spectral balance, whether a pitch was found) drive simple rules. No ML model or library.

export type CategoryId =
  | "kick"
  | "snare"
  | "clap"
  | "closedHat"
  | "openHat"
  | "cymbal"
  | "perc"
  | "vox"
  | "fx"
  | "bass"
  | "melodic"
  | "drumLoop"
  | "percLoop"
  | "melodicLoop"
  | "other";

export interface Category {
  id: CategoryId;
  label: string;
  /** Short form for tight spots such as the classifier's column headings. */
  short: string;
}

/** Drums first, then everything else. */
export const CATEGORIES: Category[] = [
  { id: "kick", label: "Kick", short: "Kick" },
  { id: "snare", label: "Snare", short: "Snare" },
  { id: "clap", label: "Clap", short: "Clap" },
  { id: "closedHat", label: "Closed Hat", short: "Closed" },
  { id: "openHat", label: "Open Hat", short: "Open" },
  { id: "cymbal", label: "Cymbal", short: "Cymbal" },
  { id: "vox", label: "Vox", short: "Vox" },
  { id: "perc", label: "Perc", short: "Perc" },
  { id: "fx", label: "FX", short: "FX" },
  { id: "bass", label: "Bass", short: "Bass" },
  { id: "melodic", label: "Melodic", short: "Melodic" },
  { id: "drumLoop", label: "Drum Loop", short: "Drum loop" },
  { id: "percLoop", label: "Perc Loop", short: "Perc loop" },
  { id: "melodicLoop", label: "Melodic Loop", short: "Mel loop" },
  { id: "other", label: "Other", short: "Other" },
];

/**
 * The base tones of the colour scheme. Categories in the same tone are shades of one colour, so a palette
 * holds one colour per tone: snare and clap share one (kick has its own, so it stands apart); closed hat, open hat and cymbals another; vox and perc a third; drum and perc loops share a fourth and melodic loops have their own.
 */
export type ToneId = "kick" | "snareClap" | "hats" | "percVox" | "fx" | "bass" | "melodic" | "other" | "drumPercLoop" | "melodicLoop";

/** Order matters: a palette lists its colours in this same order. */
export const TONES: ToneId[] = ["kick", "snareClap", "hats", "percVox", "fx", "bass", "melodic", "other", "drumPercLoop", "melodicLoop"];

export const CATEGORY_TONE: Record<CategoryId, ToneId> = {
  kick: "kick",
  snare: "snareClap",
  clap: "snareClap",
  closedHat: "hats",
  openHat: "hats",
  cymbal: "hats",
  vox: "percVox",
  perc: "percVox",
  fx: "fx",
  bass: "bass",
  melodic: "melodic",
  drumLoop: "drumPercLoop",
  percLoop: "drumPercLoop",
  melodicLoop: "melodicLoop",
  other: "other",
};

export function categoryIndex(id: CategoryId): number {
  return Math.max(0, CATEGORIES.findIndex((c) => c.id === id));
}

/** Bass, melodic and melodic loops are tuned by default; drums and everything else are left alone. */
export function isTunedCategory(id: CategoryId | undefined): boolean {
  return id === "bass" || id === "melodic" || id === "melodicLoop";
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES[categoryIndex(id)].label;
}

/** Drum categories: what a finger-drumming layout is made of (and what the classifier's drum columns cover). */
const DRUM_CATEGORIES: CategoryId[] = ["kick", "snare", "clap", "closedHat", "openHat", "cymbal", "vox", "perc"];

export function isDrumCategory(category: CategoryId | undefined): boolean {
  return category !== undefined && DRUM_CATEGORIES.includes(category);
}

/** Older saves and projects may hold category ids that no longer exist ("hat", "vocal"); unknown ones become "other". */
export function migrateCategory(id: string | undefined): CategoryId {
  if (id === "hat") return "closedHat";
  if (id === "vocal") return "vox";
  return CATEGORIES.some((c) => c.id === id) ? (id as CategoryId) : "other";
}

/** What a finger-drumming layout is made of: the drum categories plus FX hits. */
export function isKitCategory(category: CategoryId | undefined): boolean {
  return isDrumCategory(category) || category === "fx";
}

// Order matters: the first matching rule wins, so specific words come before generic ones.
// "hat" is resolved by decay time when the name doesn't say open or closed.
// Anything with no telltale word falls through to "other". A name containing "loop" turns the category it
// would otherwise get into its loop version (see LOOP_OF); breaks count as drum loops.
const NAME_RULES: [CategoryId | "hat", RegExp][] = [
  ["drumLoop", /\b(break|breakbeat|amen|drum loops?|drums loops?|beat loops?)\b/],
  ["kick", /\b(kick|kik|bd|bassdrum|bass drum)\b/],
  ["clap", /\b(clap|claps|handclap)\b/],
  ["snare", /\b(snare|rim|rimshot|sidestick|side stick|snap|sd)\b/],
  ["openHat", /\b(open ?hat|open ?hh|ohat|ohh|ohh)\b/],
  ["cymbal", /\b(crash|cymbal|china|splash|ride)\b/],
  ["closedHat", /\b(closed ?hat|closed ?hh|chat|chh|pedal)\b/],
  ["hat", /\b(hi ?hat|hh|hat|hats)\b/],
  ["vox", /\b(vocal|vocals|vox|voice|choir|acapella|chant|breath|adlib|ad-lib)\b/],
  ["fx", /\b(fx|sfx|riser|sweep|impact|whoosh|transition|downlifter|uplifter|noise|glitch|foley|texture|swell|ambience|ambient|atmos|drone|zap|laser|siren|reverse|reversed|rev|scratch|vinyl|crackle|static|stinger|sting|boom|rumble|burst|effect|effects|sci ?fi|explosion|bomb)\b/],
  ["perc", /\b(tom|toms|perc|percussion|conga|bongo|tamb|tambourine|cowbell|clave|woodblock|timpani|shaker|shakers|cabasa|guiro|drum)\b/],
  ["bass", /\b(808|bass|sub|reese)\b/],
  ["melodic", /\b(piano|keys|key|bell|bells|pluck|guitar|harp|mallet|marimba|kalimba|rhodes|epiano|stab|vibraphone|glock|glockenspiel|celesta|chime|pad|synth|lead|chord|chords|strings|string|organ|arp|saw|brass|horn|flute)\b/],
];

/** The loop category a sound becomes when its name says "loop": drums become drum loops, perc perc loops, bass and melodic melodic loops. */
const LOOP_OF: Partial<Record<CategoryId, CategoryId>> = {
  kick: "drumLoop",
  snare: "drumLoop",
  clap: "drumLoop",
  closedHat: "drumLoop",
  openHat: "drumLoop",
  cymbal: "drumLoop",
  perc: "percLoop",
  bass: "melodicLoop",
  melodic: "melodicLoop",
};

/** Decay (seconds to fall 20 dB) at which a hat with no open/closed keyword counts as open. */
const OPEN_HAT_DECAY = 0.3;
/** Decay at which a sound with no name at all rings so long it is a cymbal. */
const CYMBAL_DECAY = 1.0;

/** A sound named a hat is open or closed, never a cymbal, however long its tail measures. */
function namedHatByDecay(decay: number): CategoryId {
  return decay >= OPEN_HAT_DECAY ? "openHat" : "closedHat";
}

function hatByDecay(decay: number): CategoryId {
  return decay >= CYMBAL_DECAY ? "cymbal" : namedHatByDecay(decay);
}

/** Whether a (normalised, lower-case) name says "open" or "closed" next to a hat word: "open hi hat", "hh open", "hat o", "hat c". */
export function hatOpenness(name: string): "openHat" | "closedHat" | null {
  if (/\b(open|opened|oh|ohh|o)\b/.test(name)) return "openHat";
  if (/\b(closed|close|ch|chh|c|pedal)\b/.test(name)) return "closedHat";
  return null;
}

/** Whether a file or folder name says 808 ("808 Kick", "Sub_808_01", "808s"): the long, tuned sub kicks bass pads keep apart from ordinary bass. */
export function is808Name(name: string): boolean {
  return /(^|[^0-9a-z])808s?($|[^0-9a-z])/i.test(name.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "));
}

/** Category implied by a file name ("hat" when it is a hat of unknown openness), or null when it has no telltale word. */
export function classifyByName(fileName: string): CategoryId | "hat" | null {
  const name = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-.()[\]]+/g, " ")
    .toLowerCase();
  const isLoop = /\b(loop|loops)\b/.test(name);
  for (const [id, re] of NAME_RULES) {
    if (!re.test(name)) continue;
    if (id === "hat" && !isLoop) return hatOpenness(name) ?? "hat";
    return isLoop && id !== "hat" ? (LOOP_OF[id] ?? id) : isLoop ? "drumLoop" : id;
  }
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

export interface Features {
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

export function extractFeatures(mono: Float32Array, sampleRate: number): Features | null {
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
  if (byName && byName !== "hat") return byName;

  const f = extractFeatures(mono, sampleRate);
  if (byName === "hat") return f ? namedHatByDecay(f.decay) : "closedHat";
  if (!f) return "other";
  const pitched = detectedMidi != null;

  if (f.duration >= 4) return pitched ? "melodicLoop" : "drumLoop";
  if (f.low > 0.7 && f.duration < 0.6 && f.decay < 0.5) return "kick";

  if (pitched) {
    return detectedMidi < 50 && f.centroid < 600 ? "bass" : "melodic";
  }

  if (f.duration < 1.5) {
    if (f.centroid > 6500 && f.high > 0.5) return hatByDecay(f.decay);
    if (f.low > 0.45 && f.centroid < 500) return "kick";
    if (f.flatness > 0.15 && f.centroid > 1500) return "snare";
    return "other";
  }
  // Long but not a loop and with no pitch: a bright wash is a cymbal, anything else (risers, sweeps, impacts) is an effect.
  return f.centroid > 6500 && f.high > 0.5 ? "cymbal" : "fx";
}
