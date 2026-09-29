import * as Comlink from "comlink";
import type { AnalysisWorkerApi } from "./analysis.worker";

// A small fixed pool keeps the UI thread free while a whole project's pads are analyzed.
const POOL_SIZE = Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2));

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
