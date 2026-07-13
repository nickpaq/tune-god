import { useState } from "react";
import { SampleRow } from "./SampleRow";
import { useSamplesStore, useTargetInfo } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { downloadTunedKoalaProject } from "../audio/koalaProject";

export function ResultsTable() {
  const { state } = useSamplesStore();
  const { processAll } = useAppActions();
  const { samples, koalaProject, master } = state;
  const targetInfo = useTargetInfo(master);
  const targetBpm = master?.bpm;
  const [exporting, setExporting] = useState(false);
  const tunedPadCount = samples.filter(
    (s) => s.koalaSampleId !== undefined && s.mode !== "drum" && s.processedChannelData,
  ).length;

  if (samples.length === 0) return null;

  const handleDownload = async () => {
    if (!koalaProject) return;
    setExporting(true);
    try {
      await downloadTunedKoalaProject(koalaProject, samples, { scale: targetInfo?.scale, bpm: targetBpm });
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel">
      <div className="batch-actions">
        <button onClick={processAll}>Process all</button>
        {koalaProject && (
          <button
            onClick={handleDownload}
            disabled={tunedPadCount === 0 || exporting}
            title={
              tunedPadCount === 0
                ? "Process at least one pad from the imported Koala project first"
                : `Rebuilds ${koalaProject.originalName} with ${tunedPadCount} tuned pad${tunedPadCount === 1 ? "" : "s"} swapped in`
            }
          >
            {exporting ? "🐨 Preparing…" : "🐨 Download tuned Koala file"}
          </button>
        )}
      </div>
      <div className="sample-list">
        {samples.map((s, i) => (
          <SampleRow key={s.id} sample={s} number={i + 1} />
        ))}
      </div>
    </section>
  );
}
