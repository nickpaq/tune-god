// Wrapper around essentia.js (WASM build of the Essentia C++ MIR library).
// Runs inside a Web Worker. Provides key/scale estimation (KeyExtractor,
// HPCP + Krumhansl/Temperley/Edma profile correlation) and BPM estimation
// (RhythmExtractor2013) — both fully on-device, no network calls.
import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.es.js";
import Essentia from "essentia.js/dist/essentia.js-core.es.js";
import type { Scale } from "../theory";

export interface KeyDetectionResult {
  tonicPitchClass: number; // 0=C .. 11=B
  tonicName: string;
  scale: Scale;
  strength: number; // 0..1 confidence from the Key algorithm
}

export interface BpmDetectionResult {
  bpm: number;
  confidence: number;
}

let essentiaPromise: Promise<any> | null = null;

// The essentia-wasm ES build instantiates its WASM module synchronously at
// import time (this file runs inside a dedicated Worker, where the
// synchronous WebAssembly instantiation path Emscripten falls back to is
// unrestricted, unlike on the main thread) — EssentiaWASM is already a
// ready-to-use module object, not a factory to call.
async function getEssentia(): Promise<any> {
  if (!essentiaPromise) {
    essentiaPromise = Promise.resolve(new Essentia(EssentiaWASM));
  }
  return essentiaPromise;
}

export async function detectKey(mono: Float32Array, sampleRate: number): Promise<KeyDetectionResult> {
  const essentia = await getEssentia();
  const vector = essentia.arrayToVector(mono);
  // 'edma' profile is tuned for electronic/produced music and distinguishes
  // major/minor more reliably than the classical Krumhansl profile on loops.
  const result = essentia.KeyExtractor(
    vector,
    true,
    4096,
    4096,
    12,
    3500,
    60,
    25,
    0.2,
    "edma",
    sampleRate,
    0.0001,
    440,
    "cosine",
    "hann",
  );
  vector.delete?.();

  const scale: Scale = result.scale === "minor" ? "minor" : "major";
  return {
    tonicPitchClass: pitchClassFromEssentiaKeyName(result.key),
    tonicName: result.key,
    scale,
    strength: result.strength,
  };
}

export async function detectBpm(mono: Float32Array, _sampleRate: number): Promise<BpmDetectionResult> {
  const essentia = await getEssentia();
  const vector = essentia.arrayToVector(mono);
  const result = essentia.RhythmExtractor2013(vector, 208, "multifeature", 40);
  vector.delete?.();
  return { bpm: result.bpm, confidence: result.confidence ?? 0 };
}

const ESSENTIA_NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

function pitchClassFromEssentiaKeyName(name: string): number {
  const idx = ESSENTIA_NOTE_INDEX[name];
  if (idx === undefined) throw new Error(`Unrecognized key name from essentia: ${name}`);
  return idx;
}
