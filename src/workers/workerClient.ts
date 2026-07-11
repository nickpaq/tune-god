import * as Comlink from "comlink";
import type { AnalysisWorkerApi } from "./analysis.worker";
import type { RenderWorkerApi } from "./render.worker";

// A small fixed pool per worker type keeps the UI thread free while batch
// analysis/processing runs, without spawning unbounded workers for large batches.
const POOL_SIZE = Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2));

function createPool<T>(factory: () => Worker): Comlink.Remote<T>[] {
  const pool: Comlink.Remote<T>[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push(Comlink.wrap<T>(factory()));
  }
  return pool;
}

let analysisPool: Comlink.Remote<AnalysisWorkerApi>[] | null = null;
let renderPool: Comlink.Remote<RenderWorkerApi>[] | null = null;
let nextAnalysis = 0;
let nextRender = 0;

function getAnalysisPool(): Comlink.Remote<AnalysisWorkerApi>[] {
  if (!analysisPool) {
    analysisPool = createPool<AnalysisWorkerApi>(
      () => new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" }),
    );
  }
  return analysisPool;
}

function getRenderPool(): Comlink.Remote<RenderWorkerApi>[] {
  if (!renderPool) {
    renderPool = createPool<RenderWorkerApi>(
      () => new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" }),
    );
  }
  return renderPool;
}

export function nextAnalysisWorker(): Comlink.Remote<AnalysisWorkerApi> {
  const pool = getAnalysisPool();
  const worker = pool[nextAnalysis % pool.length];
  nextAnalysis++;
  return worker;
}

export function nextRenderWorker(): Comlink.Remote<RenderWorkerApi> {
  const pool = getRenderPool();
  const worker = pool[nextRender % pool.length];
  nextRender++;
  return worker;
}
