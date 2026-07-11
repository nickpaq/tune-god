import { useEffect, useRef, useState } from "react";
import { useSamplesStore, useTargetFrequencyLabel } from "../state/samplesStore";
import { midiToFrequency, pitchClassIndex } from "../audio/theory";
import { playTone, type ToneHandle } from "../audio/playback";

export function ReferenceTone() {
  const { state } = useSamplesStore();
  const targetName = useTargetFrequencyLabel(state.master);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const handleRef = useRef<ToneHandle | null>(null);

  useEffect(() => {
    handleRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => () => handleRef.current?.stop(), []);

  if (!targetName) return null;

  const frequency = midiToFrequency(60 - 12 + pitchClassIndex(targetName)); // octave below middle C..middle C range root

  const toggle = () => {
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
    <section className="panel panel--tone">
      <h2>Reference tone</h2>
      <p className="muted">
        Target root: <strong>{targetName}</strong> ({frequency.toFixed(1)} Hz)
      </p>
      <div className="tone-controls">
        <button onClick={toggle}>{playing ? "■ Stop" : "▶ Play tone"}</button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </section>
  );
}
