declare module "essentia.js/dist/essentia.js-core.es.js" {
  const Essentia: new (module: unknown) => any;
  export default Essentia;
}

declare module "essentia.js/dist/essentia-wasm.es.js" {
  export const EssentiaWASM: { ready: Promise<unknown> };
}
