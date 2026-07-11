import { Dropzone } from "./Dropzone";
import { SampleRow } from "./SampleRow";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { downloadAllAsZip } from "../audio/exportSample";

export function ResultsTable() {
  const { state } = useSamplesStore();
  const { addSampleFiles, processAll } = useAppActions();
  const { samples } = state;

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
            <button onClick={() => downloadAllAsZip(samples)}>Download ZIP</button>
          </div>
          <table className="results-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Detected</th>
                <th>Mode</th>
                <th>Loop</th>
                <th>Preview</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <SampleRow key={s.id} sample={s} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
