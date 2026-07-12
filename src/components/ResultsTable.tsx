import { useState } from "react";
import { SampleRow } from "./SampleRow";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { downloadTunedKoalaProject } from "../audio/koalaProject";

export function ResultsTable() {
  const { state } = useSamplesStore();
  const { processAll, buildTunedMaster } = useAppActions();
  const { samples, koalaProject, master, tuningMode } = state;
  const targetBpm = master?.overrideBpm ?? master?.analysis?.bpm;
  const [exporting, setExporting] = useState(false);
  const tunedPadCount = samples.filter(
    (s) => s.koalaSampleId !== undefined && s.mode !== "drum" && s.processedChannelData,
  ).length;

  if (samples.length === 0) return null;

  const handleDownload = async () => {
    if (!koalaProject) return;
    setExporting(true);
    try {
      const masterReplacement = await buildTunedMaster();
      await downloadTunedKoalaProject(
        koalaProject,
        samples,
        { bpm: targetBpm },
        masterReplacement ?? undefined,
      );
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
                : `Rebuilds ${koalaProject.originalName} with ${tunedPadCount} tuned pad${tunedPadCount === 1 ? "" : "s"} swapped in${tuningMode === "a440" ? ", plus the corrected master loop" : ""}`
            }
          >
            {exporting ? "🐨 Preparing…" : "🐨 Download tuned Koala file"}
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
