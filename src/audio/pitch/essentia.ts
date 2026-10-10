import Essentia from "essentia.js/dist/essentia.js-core.es.js";
import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.es.js";

type Vector = { size(): number; get(index: number): number; delete(): void };
type EssentiaInstance = any;

let instancePromise: Promise<EssentiaInstance> | undefined;

/** One WASM instance is shared by analysis requests inside this worker. */
function getEssentia(): Promise<EssentiaInstance> {
  // This ES-module build initializes its embedded WASM during import and exports the live module.
  instancePromise ??= Promise.resolve(new Essentia(EssentiaWASM));
  return instancePromise;
}

function takeVector(essentia: EssentiaInstance, value: Vector | undefined): number[] {
  if (!value) return [];
  try {
    return Array.from(essentia.vectorToArray(value) as Float32Array);
  } finally {
    value.delete();
  }
}

function noteClass(note: string): number | null {
  const notes: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  const normalized = note.replace("♯", "#").replace("♭", "b");
  const flats: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
  return notes[flats[normalized] ?? normalized] ?? null;
}

export interface EssentiaPitch {
  frequency: number;
  confidence: number;
}

/** Combines Essentia's probabilistic YIN track with MELODIA's harmonic pitch track. */
export async function essentiaPitchTrack(mono: Float32Array, sampleRate: number): Promise<EssentiaPitch[]> {
  if (mono.length < 4096) return [];
  const essentia = await getEssentia();
  const input = essentia.arrayToVector(mono);
  try {
    const yin = essentia.PitchYinProbabilistic(input, 8192, 512, 0.005, "negative", false, sampleRate);
    const yinPitch = takeVector(essentia, yin.pitch as Vector);
    const yinConfidence = takeVector(essentia, yin.voicedProbabilities as Vector);

    // MELODIA links harmonic peaks over time and is useful when the fundamental is weak.
    const melody = essentia.PitchMelodia(
      input, undefined, undefined, 8192, false, undefined, 512, undefined, undefined,
      8000, 60, 25, undefined, undefined, undefined, undefined, undefined, sampleRate,
    );
    const melodyPitch = takeVector(essentia, melody.pitch as Vector);
    const melodyConfidence = takeVector(essentia, melody.pitchConfidence as Vector);

    const candidates: EssentiaPitch[] = [];
    for (const [methodIndex, frequencies, confidences] of [[0, yinPitch, yinConfidence], [1, melodyPitch, melodyConfidence]] as const) {
      for (let i = 0; i < frequencies.length; i++) {
        const frequency = frequencies[i];
        if (frequency > 0 && frequency <= 12000) {
          // MELODIA's harmonic contour model is the primary estimate; probabilistic YIN
          // contributes independent evidence, but its HMM can choose a subharmonic.
          const reliability = methodIndex === 0 ? 0.25 : 1;
          candidates.push({ frequency, confidence: Math.max(0.01, Math.min(1, confidences[i] ?? 0.5)) * reliability });
        }
      }
    }
    return candidates;
  } finally {
    input.delete();
  }
}

function weightedMedian(pitches: EssentiaPitch[]): EssentiaPitch | null {
  if (!pitches.length) return null;
  const weights = new Array<number>(12).fill(0);
  for (const pitch of pitches) {
    const midi = Math.round(69 + 12 * Math.log2(pitch.frequency / 440));
    weights[((midi % 12) + 12) % 12] += pitch.confidence;
  }
  const pitchClass = weights.indexOf(Math.max(...weights));
  const inClass = pitches.filter((pitch) => {
    const midi = Math.round(69 + 12 * Math.log2(pitch.frequency / 440));
    return ((midi % 12) + 12) % 12 === pitchClass;
  }).sort((a, b) => a.frequency - b.frequency);
  return inClass[Math.floor(inClass.length / 2)] ?? null;
}

/** Detects a sample's stable root, lifting sub-bass before analysis when required. */
export async function essentiaDominantPitch(mono: Float32Array, sampleRate: number): Promise<EssentiaPitch | null> {
  const head = mono.subarray(0, Math.min(mono.length, sampleRate * 4));
  const half = Math.floor(head.length / 2);
  const settled = head.subarray(half);
  let pitches = await essentiaPitchTrack(settled.length >= 4096 ? settled : head, sampleRate);
  let estimate = weightedMedian(pitches);
  if (!estimate) return null;
  if (!bassHeavy(head, sampleRate)) return estimate.confidence >= 0.12 ? estimate : null;

  // Compare octave-lifted estimates around the bass range: probabilistic YIN's
  // HMM has a ~62 Hz floor, and weak sub fundamentals often read as the 2nd harmonic.
  const candidates: EssentiaPitch[] = [];

  // Decimation shifts the sub fundamental into the reliable range while preserving its pitch class.
  for (const factor of [2, 4, 8]) {
    const lifted = new Float32Array(Math.floor(settled.length / factor));
    for (let i = 0; i < lifted.length; i++) {
      let sum = 0;
      for (let j = 0; j < factor; j++) sum += settled[i * factor + j];
      lifted[i] = sum / factor;
    }
    pitches = await essentiaPitchTrack(lifted, sampleRate);
    estimate = weightedMedian(pitches);
    if (estimate) candidates.push({ ...estimate, frequency: estimate.frequency / factor });
  }
  const result = weightedMedian(candidates) ?? estimate;
  return result && result.confidence >= 0.12 ? result : null;
}

function bassHeavy(mono: Float32Array, sampleRate: number): boolean {
  const alpha = 1 - Math.exp((-2 * Math.PI * 110) / sampleRate);
  let lowPass = 0;
  let lowEnergy = 0;
  let totalEnergy = 0;
  for (const sample of mono) {
    lowPass += alpha * (sample - lowPass);
    lowEnergy += lowPass * lowPass;
    totalEnergy += sample * sample;
  }
  return totalEnergy > 0 && lowEnergy / totalEnergy >= 0.5;
}

export interface EssentiaKey {
  pc: number;
  minor: boolean;
  minorPc: number;
  midi: number;
  confidence: number;
}

/** Full-spectrum HPCP key estimate for polyphonic melodic loops. */
export async function essentiaKey(mono: Float32Array, sampleRate: number): Promise<EssentiaKey | null> {
  if (mono.length < sampleRate * 2) return null;
  const essentia = await getEssentia();
  const input = essentia.arrayToVector(mono);
  try {
    const result = essentia.KeyExtractor(input, true, 4096, 2048, 36, 5000, 100, 25, 0.1, "bgate", sampleRate);
    const pc = noteClass(String(result.key));
    if (pc === null) return null;
    const minor = String(result.scale).toLowerCase().includes("minor");
    const minorPc = minor ? pc : (pc + 9) % 12;
    return { pc, minor, minorPc, midi: 48 + minorPc, confidence: Number(result.strength ?? result.firstToSecondRelativeStrength ?? 0) };
  } finally {
    input.delete();
  }
}

export const essentiaLoopKey = essentiaKey;

/** Beat tracker used for imported loops and song analysis. Input is resampled to 44.1 kHz by the caller. */
export async function essentiaTempo(mono: Float32Array, sampleRate = 44100): Promise<{ bpm: number; downbeatSeconds: number }> {
  if (mono.length < sampleRate * 2) throw new Error("Not enough audio to detect a beat");
  const mono44100 = sampleRate === 44100 ? mono : resample(mono, sampleRate, 44100);
  const essentia = await getEssentia();
  const input = essentia.arrayToVector(mono44100);
  try {
    const result = essentia.RhythmExtractor2013(input, 208, "multifeature", 40);
    const bpm = Number(result.bpm);
    const ticks = result.ticks as Vector;
    const beats = takeVector(essentia, ticks);
    const downbeatSeconds = beats[0];
    if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(downbeatSeconds)) throw new Error("No beat found");
    return { bpm, downbeatSeconds };
  } finally {
    input.delete();
  }
}

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  const output = new Float32Array(Math.ceil(input.length * toRate / fromRate));
  const scale = fromRate / toRate;
  for (let i = 0; i < output.length; i++) {
    const at = i * scale;
    const left = Math.min(input.length - 1, Math.floor(at));
    const right = Math.min(input.length - 1, left + 1);
    const fraction = at - left;
    output[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}
