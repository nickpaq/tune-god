declare module "essentia.js/dist/essentia-wasm.es.js" {
  export const EssentiaWASM: unknown;
}

declare module "essentia.js/dist/essentia.js-core.es.js" {
  export default class Essentia {
    constructor(wasmModule: unknown);
    arrayToVector(input: Float32Array): unknown;
    vectorToArray(input: unknown): Float32Array;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    KeyExtractor(...args: any[]): { key: string; scale: string; strength: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RhythmExtractor2013(...args: any[]): { bpm: number; confidence: number };
  }
}

declare module "*.wasm?url" {
  const url: string;
  export default url;
}
