import { useEffect, useRef, useState } from "react";
import { useSamplesStore } from "../state/samplesStore";
import { playTone, type ToneHandle } from "../audio/playback";
import { PlayButton } from "./PlayButton";
import { PrecisionSlider } from "./PrecisionSlider";

const DEFAULT_VOLUME = 0.3;

/**
 * The tone generator: a "Play Root" drone at the master's by-ear tonic
 * frequency, directly editable in Hz. There's no automatic key/tuning
 * detection anymore — this frequency, dialed in by ear against the master
 * loop, *is* the tuning ground truth every sample gets shifted toward.
 */
export function ReferenceTone() {
  const { state, dispatch } = useSamplesStore();
  const frequency = state.master?.tonicFrequencyHz;
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const handleRef = useRef<ToneHandle | null>(null);

  useEffect(() => {
    handleRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (frequency !== undefined) handleRef.current?.setFrequency(frequency);
  }, [frequency]);

  useEffect(() => () => handleRef.current?.stop(), []);

  if (frequency === undefined) return null;

  const toggleRoot = () => {
    if (playing) {
      handleRef.current?.stop();
      handleRef.current = null;
      setPlaying(false);
    } else {
      handleRef.current = playTone(frequency, volume);
      setPlaying(true);
    }
  };

  return (
    <div className="tone-controls">
      <span className="tone-label">Play Root</span>
      <PlayButton playing={playing} onClick={toggleRoot} />
      <input
        className="tone-frequency"
        type="number"
        step={0.1}
        value={Math.round(frequency * 100) / 100}
        onChange={(e) => {
          const hz = Number(e.target.value);
          if (Number.isFinite(hz) && hz > 0) dispatch({ type: "SET_MASTER_TONIC_FREQUENCY", hz });
        }}
        title="The tonic's actual frequency in Hz — tune this by ear against the master loop using Play Root"
      />
      <span className="tone-unit">Hz</span>
      <PrecisionSlider
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={setVolume}
        onDoubleClick={() => setVolume(DEFAULT_VOLUME)}
        title="Tone volume. Drag down to slow the scrub. Double-tap to reset."
      />
    </div>
  );
}
