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

/**
 * Key profiles voted together for the final estimate. Each profile has
 * different failure modes — 'edma' is tuned for electronic/produced music
 * but is biased toward minor; 'bgate' (Faraldo's gated profile) is strong
 * on the same material with different errors; 'temperley' and 'krumhansl'
 * are the classical-listening profiles and anchor the major/minor decision
 * on tonal material. A strength-weighted vote across all four beats any
 * single profile on loop-length audio.
 */
const KEY_PROFILE_ENSEMBLE = ["edma", "bgate", "temperley", "krumhansl"] as const;

function runKeyExtractor(essentia: any, vector: any, sampleRate: number, profile: string) {
  return essentia.KeyExtractor(
    vector,
    true,
    4096,
    4096,
    12,
    3500,
    60,
    25,
    0.2,
    profile,
    sampleRate,
    0.0001,
    440,
    "cosine",
    "hann",
  );
}

export async function detectKey(mono: Float32Array, sampleRate: number): Promise<KeyDetectionResult> {
  const essentia = await getEssentia();
  const vector = essentia.arrayToVector(mono);

  // Strength-weighted vote: each profile's (tonic, scale) estimate adds its
  // confidence to that candidate's total; the candidate with the highest
  // total wins and its best single-profile result is reported.
  const totals = new Map<string, { weight: number; votes: number; best: any }>();
  try {
    for (const profile of KEY_PROFILE_ENSEMBLE) {
      let result: any;
      try {
        result = runKeyExtractor(essentia, vector, sampleRate, profile);
      } catch {
        continue; // a profile unsupported by this essentia build just abstains
      }
      const strength = Math.max(0, Number(result.strength) || 0);
      const candidate = `${result.key}|${result.scale}`;
      const entry = totals.get(candidate);
      if (entry) {
        entry.weight += strength;
        entry.votes += 1;
        if (strength > entry.best.strength) entry.best = result;
      } else {
        totals.set(candidate, { weight: strength, votes: 1, best: result });
      }
    }
  } finally {
    vector.delete?.();
  }

  let winner: { weight: number; votes: number; best: any } | null = null;
  for (const entry of totals.values()) {
    if (!winner || entry.weight > winner.weight) winner = entry;
  }
  if (!winner) throw new Error("Key detection failed: no key profile produced a result.");

  const result = winner.best;
  const scale: Scale = result.scale === "minor" ? "minor" : "major";
  // Confidence blends the winner's own strength with how much of the
  // ensemble agreed, so a unanimous weak call and a lone strong call don't
  // both report as certain.
  const agreement = winner.votes / KEY_PROFILE_ENSEMBLE.length;
  return {
    tonicPitchClass: pitchClassFromEssentiaKeyName(result.key),
    tonicName: result.key,
    scale,
    strength: result.strength * agreement,
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
