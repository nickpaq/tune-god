import { useCallback } from "react";
import { decodeFile, toMono, cloneChannelData, monoFromChannelData } from "../audio/decode";
import { semitonesToRatio } from "../audio/theory";
import { nextAnalysisWorker, nextRenderWorker } from "../workers/workerClient";
import { useSamplesStore, masterCorrectionSemitones, verifyErrorCents, type SampleItem } from "./samplesStore";
import { parseKoalaProject, koalaPadToFile, type KoalaMasterReplacement } from "../audio/koalaProject";
import { guessSampleMode } from "../audio/sampleModeDetect";
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
            koalaSampleId: koalaSampleIds?.[i],
          });
        } catch {
          // Skip files that fail to decode (unsupported format, corrupt file).
        }
      }
      dispatch({ type: "ADD_SAMPLES", samples: items });

      // Spread across the whole analysis worker pool instead of awaiting
      // one at a time — bpm detection now always runs (see analysis.worker),
      // so a sequential loop here would serialize the whole batch behind it.
      await Promise.all(
        items.map(async (item) => {
          dispatch({ type: "SET_SAMPLE_STATUS", id: item.id, status: "analyzing" });
          const worker = nextAnalysisWorker();
          const mono = monoFromChannelData(item.channelData);
          try {
            const analysis = await worker.analyzeSample(mono, item.sampleRate);
            dispatch({ type: "SET_SAMPLE_ANALYSIS", id: item.id, analysis });
          } catch (err) {
            dispatch({ type: "SET_SAMPLE_STATUS", id: item.id, status: "error", error: String(err) });
          }
        }),
      );
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

  /**
   * Renders a sample at an explicit shift, then runs the verify pass:
   * re-detects the pitch of the *rendered* audio and stores its cents error
   * vs the target, so mistunes surface in the UI before export. Verification
   * is best-effort — a failure there never fails the render.
   */
  const renderSample = useCallback(
    async (sample: SampleItem, shiftSemitones: number) => {
      const id = sample.id;
      dispatch({ type: "SET_SAMPLE_STATUS", id, status: "processing" });
      const worker = nextRenderWorker();
      const pitchScale = semitonesToRatio(shiftSemitones);
      try {
        const processed =
          sample.mode === "loop"
            ? await worker.process(sample.channelData, sample.sampleRate, sample.timeRatio ?? 1, pitchScale, true)
            : await worker.resamplePitch(sample.channelData, pitchScale);
        dispatch({ type: "SET_SAMPLE_PROCESSED", id, channelData: processed });

        const master = state.master;
        if (master) {
          try {
            const measured = await nextAnalysisWorker().measurePitch(
              monoFromChannelData(processed),
              sample.sampleRate,
            );
            const cents =
              measured === null ? null : verifyErrorCents(master, state.tuningMode, state.a4Reference, measured.midi);
            dispatch({
              type: "SET_SAMPLE_VERIFIED",
              id,
              cents: cents ?? undefined,
              confidence: measured?.confidence ?? 0,
            });
          } catch {
            dispatch({ type: "SET_SAMPLE_VERIFIED", id, cents: undefined, confidence: 0 });
          }
        }
      } catch (err) {
        dispatch({ type: "SET_SAMPLE_STATUS", id, status: "error", error: String(err) });
      }
    },
    [state.master, state.tuningMode, state.a4Reference, dispatch],
  );

  const processSample = useCallback(
    async (id: string) => {
      const sample = state.samples.find((s) => s.id === id);
      if (!sample || sample.mode === "drum") return;
      if (sample.pitchShiftSemitones === undefined) return;
      await renderSample(sample, sample.pitchShiftSemitones);
    },
    [state.samples, renderSample],
  );

  /**
   * Applies a manual trim and re-renders immediately. The new shift is
   * computed here rather than read back from state, since the dispatch
   * won't have landed yet when the render starts.
   */
  const trimAndProcess = useCallback(
    async (id: string, manualOffsetSemitones: number) => {
      const sample = state.samples.find((s) => s.id === id);
      if (!sample || sample.mode === "drum" || sample.pitchShiftSemitones === undefined) return;
      dispatch({ type: "SET_SAMPLE_MANUAL_OFFSET", id, semitones: manualOffsetSemitones });
      const delta = manualOffsetSemitones - (sample.manualOffsetSemitones ?? 0);
      await renderSample(sample, sample.pitchShiftSemitones + delta);
    },
    [state.samples, renderSample, dispatch],
  );

  const processAll = useCallback(async () => {
    const targets = state.samples.filter((s) => s.mode !== "drum" && s.status !== "processing");
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

  return { loadMaster, addSampleFiles, loadKoalaProject, processSample, processAll, trimAndProcess, buildTunedMaster };
}
