import { useCallback } from "react";
import { decodeFile, toMono, cloneChannelData, monoFromChannelData } from "../audio/decode";
import { semitonesToRatio } from "../audio/theory";
import { nextAnalysisWorker, nextRenderWorker } from "../workers/workerClient";
import { useSamplesStore, type SampleItem } from "./samplesStore";

function makeId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function useAppActions() {
  const { state, dispatch } = useSamplesStore();

  const loadMaster = useCallback(
    async (file: File) => {
      const buffer = await decodeFile(file);
      const mono = toMono(buffer);
      const channelData = cloneChannelData(buffer);
      dispatch({
        type: "SET_MASTER",
        master: {
          file,
          name: file.name,
          sampleRate: buffer.sampleRate,
          channelData,
          status: "analyzing",
        },
      });
      const worker = nextAnalysisWorker();
      const analysis = await worker.analyzeMaster(mono, buffer.sampleRate);
      dispatch({ type: "SET_MASTER_ANALYSIS", analysis });
    },
    [dispatch],
  );

  const addSampleFiles = useCallback(
    async (files: File[]) => {
      const items: SampleItem[] = [];
      for (const file of files) {
        try {
          const buffer = await decodeFile(file);
          items.push({
            id: makeId(),
            file,
            name: file.name,
            sampleRate: buffer.sampleRate,
            channelData: cloneChannelData(buffer),
            status: "pending",
            mode: "tune",
            isLoop: false,
          });
        } catch {
          // Skip files that fail to decode (unsupported format, corrupt file).
        }
      }
      dispatch({ type: "ADD_SAMPLES", samples: items });

      for (const item of items) {
        dispatch({ type: "SET_SAMPLE_STATUS", id: item.id, status: "analyzing" });
        const worker = nextAnalysisWorker();
        const mono = monoFromChannelData(item.channelData);
        try {
          const analysis = await worker.analyzeSample(mono, item.sampleRate, item.isLoop);
          dispatch({ type: "SET_SAMPLE_ANALYSIS", id: item.id, analysis });
        } catch (err) {
          dispatch({ type: "SET_SAMPLE_STATUS", id: item.id, status: "error", error: String(err) });
        }
      }
    },
    [dispatch],
  );

  const processSample = useCallback(
    async (id: string) => {
      const sample = state.samples.find((s) => s.id === id);
      if (!sample || sample.mode === "drum") return;
      if (sample.pitchShiftSemitones === undefined) return;

      dispatch({ type: "SET_SAMPLE_STATUS", id, status: "processing" });
      const worker = nextRenderWorker();
      try {
        const processed = await worker.process(
          sample.channelData,
          sample.sampleRate,
          sample.timeRatio ?? 1,
          semitonesToRatio(sample.pitchShiftSemitones),
          true,
        );
        dispatch({ type: "SET_SAMPLE_PROCESSED", id, channelData: processed });
      } catch (err) {
        dispatch({ type: "SET_SAMPLE_STATUS", id, status: "error", error: String(err) });
      }
    },
    [state.samples, dispatch],
  );

  const processAll = useCallback(async () => {
    const targets = state.samples.filter((s) => s.mode === "tune" && s.status !== "processing");
    await Promise.all(targets.map((s) => processSample(s.id)));
  }, [state.samples, processSample]);

  return { loadMaster, addSampleFiles, processSample, processAll };
}
