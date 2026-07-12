import { useState } from "react";
import { useSamplesStore, type SampleItem } from "../state/samplesStore";
import { togglePlayback } from "../audio/playback";
import { stripExtension } from "../audio/filename";
import { PlayButton } from "./PlayButton";

function formatShift(semitones: number): string {
  const rounded = Math.round(semitones * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}st`;
}

/** One badge summarizing where this sample is in the pipeline, and what the play button will play. */
function StatusBadge({ sample, tuned }: { sample: SampleItem; tuned: boolean }) {
  if (sample.mode === "drum") return <span className="badge badge--muted">untouched</span>;
  switch (sample.status) {
    case "pending":
    case "analyzing":
      return <span className="badge badge--muted">analyzing…</span>;
    case "processing":
      return <span className="badge badge--busy">tuning…</span>;
    case "error":
      return (
        <span className="badge badge--error" title={sample.error}>
          ⚠ failed
        </span>
      );
    default:
      if (tuned && sample.pitchShiftSemitones !== undefined) {
        return (
          <span className="badge badge--done" title="Preview plays the tuned audio">
            ✓ tuned {formatShift(sample.pitchShiftSemitones)}
          </span>
        );
      }
      if (sample.pitchShiftSemitones !== undefined) {
        return (
          <span className="badge badge--pending" title="Not processed yet — preview plays the original audio">
            will shift {formatShift(sample.pitchShiftSemitones)}
          </span>
        );
      }
      return <span className="badge badge--muted">waiting for master</span>;
  }
}

export function SampleRow({ sample }: { sample: SampleItem }) {
  const { dispatch } = useSamplesStore();
  const [playing, setPlaying] = useState(false);
  const tuned = sample.mode !== "drum" && !!sample.processedChannelData;

  const preview = () => {
    const data = tuned ? sample.processedChannelData! : sample.channelData;
    setPlaying(togglePlayback(sample.id, data, sample.sampleRate, () => setPlaying(false)));
  };

  return (
    <div className="sample-card">
      <div className="sample-card__top">
        <span className="sample-name" title={sample.name}>
          {stripExtension(sample.name)}
        </span>
        <StatusBadge sample={sample} tuned={tuned} />
        <PlayButton playing={playing} onClick={preview} />
      </div>

      <div className="sample-card__controls">
        <button
          className={`toggle-btn${sample.mode === "loop" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "loop" })}
          title="Rubber Band: tuned and time-stretched to the master's BPM, exact duration and formants preserved"
        >
          Loop
        </button>
        <button
          className={`toggle-btn${sample.mode === "oneshot" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "oneshot" })}
          title="Simple resample: tuned by pitch-shifting playback speed, keeps transients crisp"
        >
          One-shot
        </button>
        <button
          className={`toggle-btn${sample.mode === "drum" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "drum" })}
          title="Left completely untouched"
        >
          Drum
        </button>
      </div>
    </div>
  );
}
