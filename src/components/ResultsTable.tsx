import { Dropzone } from "./Dropzone";
import { SampleRow } from "./SampleRow";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { downloadAllAsZip, downloadAllIndividually, collectDragExportItems, startFileDrag } from "../audio/exportSample";
import { downloadTunedKoalaProject } from "../audio/koalaProject";

export function ResultsTable() {
  const { state } = useSamplesStore();
  const { addSampleFiles, processAll } = useAppActions();
  const { samples, master, koalaProject } = state;
  const tunedPadCount = samples.filter((s) => s.koalaSampleId !== undefined && s.mode === "tune" && s.processedChannelData).length;

  if (!master && samples.length === 0) return null;

  return (
    <section className="panel">
      <Dropzone label="Drop samples here to tune" multiple onFiles={(files) => addSampleFiles(files)} />

      {samples.length > 0 && (
        <>
          <div className="batch-actions">
            <button onClick={processAll}>Process all</button>
            <button onClick={() => downloadAllIndividually(samples, master)}>Download all</button>
            <button onClick={() => downloadAllAsZip(samples, master)}>Download ZIP</button>
            <button
              className="drag-all-chip"
              draggable
              onDragStart={(e) => startFileDrag(e.dataTransfer, collectDragExportItems(samples, master))}
              title="Drag all processed sounds (and the master loop) straight into another app"
            >
              ⠿ Drag all out
            </button>
            {koalaProject && (
              <button
                onClick={() => downloadTunedKoalaProject(koalaProject, samples)}
                disabled={tunedPadCount === 0}
                title={
                  tunedPadCount === 0
                    ? "Process at least one pad from the imported Koala project first"
                    : `Rebuilds ${koalaProject.originalName} with ${tunedPadCount} tuned pad${tunedPadCount === 1 ? "" : "s"} swapped in`
                }
              >
                🐨 Download tuned Koala file
              </button>
            )}
          </div>
          <div className="sample-list">
            {samples.map((s) => (
              <SampleRow key={s.id} sample={s} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
