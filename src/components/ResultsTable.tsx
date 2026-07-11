import { Dropzone } from "./Dropzone";
import { SampleRow } from "./SampleRow";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { downloadAllAsZip, collectDragExportItems, startFileDrag } from "../audio/exportSample";

export function ResultsTable() {
  const { state } = useSamplesStore();
  const { addSampleFiles, processAll } = useAppActions();
  const { samples, master } = state;

  return (
    <section className="panel">
      <h2>2. Sample batch</h2>
      <Dropzone
        label="Drop your sample batch here"
        hint="One-shots to tune (skip drum hits with the Drum toggle below)"
        multiple
        onFiles={(files) => addSampleFiles(files)}
      />

      {samples.length > 0 && (
        <>
          <div className="batch-actions">
            <button onClick={processAll}>Process all</button>
            <button onClick={() => downloadAllAsZip(samples, master)}>Download ZIP</button>
            <button
              className="drag-all-chip"
              draggable
              onDragStart={(e) => startFileDrag(e.dataTransfer, collectDragExportItems(samples, master))}
              title="Drag all processed sounds (and the master loop) straight into another app"
            >
              ⠿ Drag all out
            </button>
          </div>
          <p className="muted drag-hint">
            Tip: drag the ⠿ handle on any row — or “Drag all out” above — straight into your DAW or file manager.
            Works in Chrome/Edge; other browsers fall back to the download buttons.
          </p>
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
