import { useState } from "react";
import { useSamplesStore, type SampleItem } from "../state/samplesStore";
import { togglePlayback } from "../audio/playback";
import { stripExtension } from "../audio/filename";
import { PlayButton } from "./PlayButton";

export function SampleRow({ sample }: { sample: SampleItem }) {
  const { dispatch } = useSamplesStore();
  const [playing, setPlaying] = useState(false);

  const preview = () => {
    const data =
      sample.mode === "drum" ? sample.channelData : (sample.processedChannelData ?? sample.channelData);
    setPlaying(togglePlayback(sample.id, data, sample.sampleRate, () => setPlaying(false)));
  };

  return (
    <div className="sample-card">
      <div className="sample-card__top">
        <span className="sample-name" title={sample.name}>
          {stripExtension(sample.name)}
        </span>
        <PlayButton playing={playing} onClick={preview} />
      </div>

      <div className="sample-card__controls">
        <button
          className={`toggle-btn${sample.mode === "tune" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "tune" })}
        >
          Tune
        </button>
        <button
          className={`toggle-btn${sample.mode === "drum" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "drum" })}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
