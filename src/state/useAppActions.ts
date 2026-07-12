import { useCallback } from "react";
import { decodeFile, toMono, cloneChannelData, monoFromChannelData } from "../audio/decode";
import { semitonesToRatio } from "../audio/theory";
import { nextAnalysisWorker, nextRenderWorker } from "../workers/workerClient";
import { useSamplesStore, masterCorrectionSemitones, type SampleItem } from "./samplesStore";
import { parseKoalaProject, koalaPadToFile, type KoalaMasterReplacement } from "../audio/koalaProject";
import { guessSampleMode } from "../audio/drumDetect";
import { parseFilenameMetadata } from "../audio/filenameMetadata";

function makeId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function useAppActions() {
  const { state, dispatch } = useSamplesStore();

  const loadMaster = useCallback(
    async (file: File, koalaSampleId?: number) => {
      const buffer = await decodeFile(file);
      const mono = toMono(buffer);
      const channelData = cloneChannelData(buffer);
      const filenameMeta = parseFilenameMetadata(file.name);
      dispatch({
        type: "SET_MASTER",
        master: {
          file,
          name: file.name,
          sampleRate: buffer.sampleRate,
          channelData,
          status: "analyzing",
          koalaSampleId,
          overrideTonicPitchClass: filenameMeta.tonicPitchClass,
          overrideScale: filenameMeta.scale,
          overrideBpm: filenameMeta.bpm,
        },
      });
      const worker = nextAnalysisWorker();
      const analysis = await worker.analyzeMaster(mono, buffer.sampleRate);
      dispatch({ type: "SET_MASTER_ANALYSIS", analysis });
    },
    [dispatch],
  );

  const addSampleFiles = useCallback(
    async (files: File[], koalaSampleIds?: (number | undefined)[]) => {
      const items: SampleItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const buffer = await decodeFile(file);
          items.push({
            id: makeId(),
            file,
            name: file.name,
            sampleRate: buffer.sampleRate,
            channelData: cloneChannelData(buffer),
            status: "pending",
            mode: guessSampleMode(file.name),
            isLoop: false,
            koalaSampleId: koalaSampleIds?.[i],
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

  /**
   * Imports a whole .koala project: the lowest-numbered pad (top-left slot)
   * becomes the master loop, every other sample pad is loaded into the batch
   * exactly like a normal file drop. The parsed project (zip + sampler.json)
   * is kept in state so a tuned project can be rebuilt later.
   */
  const loadKoalaProject = useCallback(
    async (file: File) => {
      const project = await parseKoalaProject(file);
      const [masterPad, ...restPads] = project.pads;

      const masterFile = await koalaPadToFile(project, masterPad);
      await loadMaster(masterFile, masterPad.sampleId);

      if (restPads.length) {
        const sampleFiles = await Promise.all(restPads.map((p) => koalaPadToFile(project, p)));
        await addSampleFiles(
          sampleFiles,
          restPads.map((p) => p.sampleId),
        );
      }

      dispatch({ type: "SET_KOALA_PROJECT", project });
    },
    [loadMaster, addSampleFiles, dispatch],
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

  /**
   * In "a440" mode the master loop itself is retuned onto its detected
   * tonic at the chosen reference pitch, so the exported project's own pad
   * needs correcting too — computed fresh here rather than stored in state,
   * since it only matters at export time. Returns null in "master" mode
   * (the master stays pristine) or if this master didn't come from a .koala
   * project (no pad to swap it into).
   */
  const buildTunedMaster = useCallback(async (): Promise<KoalaMasterReplacement | null> => {
    const { master, tuningMode, a4Reference } = state;
    if (!master || master.koalaSampleId === undefined || tuningMode !== "a440") return null;
    const shift = masterCorrectionSemitones(master, tuningMode, a4Reference);
    const worker = nextRenderWorker();
    const channelData = await worker.process(master.channelData, master.sampleRate, 1, semitonesToRatio(shift), true);
    return { koalaSampleId: master.koalaSampleId, sampleRate: master.sampleRate, channelData };
  }, [state.master, state.tuningMode, state.a4Reference]);

  return { loadMaster, addSampleFiles, loadKoalaProject, processSample, processAll, buildTunedMaster };
}
