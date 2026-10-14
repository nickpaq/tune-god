import { watchWorker } from "../diagnostics";
import * as Comlink from "comlink";
import { monoFromChannelData } from "../audio/decode";
import { taskQueue } from "./taskQueue";
import type { AnalysisWorkerApi } from "./analysis.worker";
import type { RenderWorkerApi } from "./render.worker";

// A small fixed pool keeps the UI thread free while a whole project's pads are analyzed.
const POOL_SIZE = Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2));

let pool: Comlink.Remote<AnalysisWorkerApi>[] | null = null;
let next = 0;

export function nextAnalysisWorker(): Comlink.Remote<AnalysisWorkerApi> {
  if (!pool) {
    pool = Array.from({ length: POOL_SIZE }, () =>
      Comlink.wrap<AnalysisWorkerApi>(watchWorker(new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" }), "Analysis")),
    );
  }
  return pool[next++ % pool.length];
}

let renderWorker: Comlink.Remote<RenderWorkerApi> | null = null;

export function getRenderWorker(): Comlink.Remote<RenderWorkerApi> {
  renderWorker ??= Comlink.wrap<RenderWorkerApi>(watchWorker(new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" }), "Render"));
  return renderWorker;
}

const queueAnalysis = taskQueue(POOL_SIZE);
/** Keep queued jobs as references to existing audio; transfer only a running job's own mono copy. */
export function analyzeAudio(
  channelData: Float32Array[],
  ...args: [sampleRate: number, fileName: string, isLoop?: boolean, categoryHint?: Parameters<AnalysisWorkerApi["analyze"]>[4]]
): Promise<ReturnType<AnalysisWorkerApi["analyze"]>> {
  return queueAnalysis(() => {
    const mono = channelData.length === 1 ? channelData[0].slice() : monoFromChannelData(channelData);
    return nextAnalysisWorker().analyze(Comlink.transfer(mono, [mono.buffer]), ...args);
  });
}
