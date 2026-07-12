import { SampleRow } from "./SampleRow";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { downloadTunedKoalaProject } from "../audio/koalaProject";

export function ResultsTable() {
  const { state } = useSamplesStore();
  const { processAll } = useAppActions();
  const { samples, koalaProject } = state;
  const tunedPadCount = samples.filter(
    (s) => s.koalaSampleId !== undefined && s.mode === "tune" && s.processedChannelData,
  ).length;

  if (samples.length === 0) return null;

  return (
    <section className="panel">
      <div className="batch-actions">
        <button onClick={processAll}>Process all</button>
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
    </section>
  );
}
