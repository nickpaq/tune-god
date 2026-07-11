import { useState } from "react";
import { Dropzone } from "./Dropzone";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { NOTE_NAMES, formatCents } from "../audio/theory";
import { playChannelData } from "../audio/playback";

export function MasterPanel() {
  const { state, dispatch } = useSamplesStore();
  const { loadMaster } = useAppActions();
  const { master } = state;
  const [busy, setBusy] = useState(false);

  if (!master) {
    return (
      <section className="panel">
        <h2>1. Master loop</h2>
        <Dropzone
          label="Drop your master loop here"
          hint="The loop whose key & tempo everything else will match"
          onFiles={async (files) => {
            setBusy(true);
            try {
              await loadMaster(files[0]);
            } finally {
              setBusy(false);
            }
          }}
        />
        {busy && <p className="muted">Analyzing…</p>}
      </section>
    );
  }

  const a = master.analysis;
  const tonic = master.overrideTonicPitchClass ?? a?.tonicPitchClass;
  const scale = master.overrideScale ?? a?.scale;

  return (
    <section className="panel">
      <h2>1. Master loop</h2>
      <div className="master-summary">
        <div>
          <strong>{master.name}</strong>
          <button className="link-btn" onClick={() => playChannelData(master.channelData, master.sampleRate)}>
            ▶ preview
          </button>
        </div>
        {master.status === "analyzing" && <p className="muted">Analyzing…</p>}
        {a && (
          <div className="master-detail">
            <label>
              Key
              <select
                value={tonic}
                onChange={(e) =>
                  dispatch({
                    type: "SET_MASTER_OVERRIDE",
                    tonicPitchClass: Number(e.target.value),
                    scale,
                  })
                }
              >
                {NOTE_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scale
              <select
                value={scale}
                onChange={(e) =>
                  dispatch({
                    type: "SET_MASTER_OVERRIDE",
                    tonicPitchClass: tonic,
                    scale: e.target.value as "major" | "minor",
                  })
                }
              >
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </label>
            <span className="badge">confidence {(a.keyStrength * 100).toFixed(0)}%</span>
            <span className="badge">{a.bpm.toFixed(1)} BPM</span>
            <span className="badge">tuning {formatCents(a.tuningOffsetCents)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
