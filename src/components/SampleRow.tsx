import { useState } from "react";
import { useSamplesStore, type SampleItem } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { formatNoteWithCents } from "../audio/theory";
import { togglePlayback } from "../audio/playback";
import { downloadSample } from "../audio/exportSample";

export function SampleRow({ sample }: { sample: SampleItem }) {
  const { dispatch } = useSamplesStore();
  const { processSample } = useAppActions();
  const [playing, setPlaying] = useState(false);

  const preview = () => {
    const data =
      sample.mode === "drum" ? sample.channelData : (sample.processedChannelData ?? sample.channelData);
    setPlaying(togglePlayback(sample.id, data, sample.sampleRate, () => setPlaying(false)));
  };

  return (
    <tr>
      <td className="sample-name" title={sample.name}>
        {sample.name}
      </td>
      <td>
        {sample.status === "analyzing" && <span className="muted">analyzing…</span>}
        {sample.status === "error" && <span className="error">error</span>}
        {sample.analysis && (
          <span>
            {formatNoteWithCents(sample.analysis.detectedMidi)}
            {sample.pitchShiftSemitones !== undefined && (
              <span className="muted"> ({sample.pitchShiftSemitones >= 0 ? "+" : ""}
              {sample.pitchShiftSemitones.toFixed(2)} st)</span>
            )}
          </span>
        )}
      </td>
      <td>
        <button
          className={`toggle-btn${sample.mode === "tune" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "tune" })}
        >
          Tune
        </button>
        <button
          className={`toggle-btn${sample.mode === "drum" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "drum" })}
          title="Restore original file, no pitch/time processing"
        >
          Drum
        </button>
      </td>
      <td>
        <label className="loop-checkbox">
          <input
            type="checkbox"
            checked={sample.isLoop}
            disabled={sample.mode === "drum"}
            onChange={(e) => dispatch({ type: "SET_SAMPLE_LOOP", id: sample.id, isLoop: e.target.checked })}
          />
          Loop
        </label>
      </td>
      <td>
        <button onClick={preview}>{playing ? "⏸" : "▶"}</button>
      </td>
      <td>
        {sample.mode === "tune" && (
          <button onClick={() => processSample(sample.id)} disabled={sample.status === "processing"}>
            {sample.status === "processing" ? "…" : sample.processedChannelData ? "Re-process" : "Process"}
          </button>
        )}
        <button onClick={() => downloadSample(sample)} disabled={sample.mode === "tune" && !sample.processedChannelData}>
          ⬇
        </button>
        <button onClick={() => dispatch({ type: "REMOVE_SAMPLE", id: sample.id })}>✕</button>
      </td>
    </tr>
  );
}
