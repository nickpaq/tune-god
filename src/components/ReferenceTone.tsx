import { useEffect, useRef, useState } from "react";
import { useSamplesStore, useTargetInfo } from "../state/samplesStore";
import { midiToFrequency, smallestSignedShift } from "../audio/theory";
import { playTone, type ToneHandle } from "../audio/playback";

export function ReferenceTone() {
  const { state } = useSamplesStore();
  const target = useTargetInfo(state.master);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const handleRef = useRef<ToneHandle | null>(null);

  useEffect(() => {
    handleRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => () => handleRef.current?.stop(), []);

  if (!target) return null;

  // Tone plays the key's root note, voiced in the octave nearest middle C.
  const tonicMidi = 60 + smallestSignedShift(0, target.tonicPitchClass);
  const frequency = midiToFrequency(tonicMidi);

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
      <h2>
        Target key: {target.tonicName} {target.scale}
      </h2>
      <p className="muted">
        Samples are tuned to <strong>{target.sampleTargetName}</strong>
        {target.scale === "minor" && (
          <>
            {" "}
            so the <strong>A</strong> key on a DAW keyboard plays the root ({target.tonicName})
          </>
        )}
        {" "}— the white keys play {target.tonicName} {target.scale}.
      </p>
      <div className="tone-controls">
        <button onClick={toggle}>
          {playing ? "■ Stop" : `▶ Root tone (${target.tonicName}, ${frequency.toFixed(1)} Hz)`}
        </button>
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
