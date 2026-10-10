import * as Comlink from "comlink";
import type { AnalysisWorkerApi } from "./analysis.worker";
import type { RenderWorkerApi } from "./render.worker";

// A small fixed pool keeps the UI thread free while a whole project's pads are analyzed.
// Essentia initializes a sizable WASM runtime per worker. Two workers retain
// useful analysis parallelism without multiplying that footprint four times on phones.
const POOL_SIZE = Math.max(1, Math.min(2, navigator.hardwareConcurrency || 2));

let pool: Comlink.Remote<AnalysisWorkerApi>[] | null = null;
let next = 0;

export function nextAnalysisWorker(): Comlink.Remote<AnalysisWorkerApi> {
  if (!pool) {
    pool = Array.from({ length: POOL_SIZE }, () =>
      Comlink.wrap<AnalysisWorkerApi>(new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" })),
    );
  }
  return pool[next++ % pool.length];
}

let renderWorker: Comlink.Remote<RenderWorkerApi> | null = null;

export function getRenderWorker(): Comlink.Remote<RenderWorkerApi> {
  renderWorker ??= Comlink.wrap<RenderWorkerApi>(new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" }));
  return renderWorker;
}
