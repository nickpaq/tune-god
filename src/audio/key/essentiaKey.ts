// Wrapper around essentia.js (WASM build of the Essentia C++ MIR library).
// Runs inside a Web Worker. Provides BPM estimation (RhythmExtractor2013),
// fully on-device, no network calls.
import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.es.js";
import Essentia from "essentia.js/dist/essentia.js-core.es.js";

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

export async function detectBpm(mono: Float32Array, _sampleRate: number): Promise<BpmDetectionResult> {
  const essentia = await getEssentia();
  const vector = essentia.arrayToVector(mono);
  const result = essentia.RhythmExtractor2013(vector, 208, "multifeature", 40);
  vector.delete?.();
  return { bpm: result.bpm, confidence: result.confidence ?? 0 };
}
