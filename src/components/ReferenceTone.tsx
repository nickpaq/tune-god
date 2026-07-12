import { useEffect, useRef, useState } from "react";
import { useSamplesStore, useTargetInfo } from "../state/samplesStore";
import { midiToFrequency, smallestSignedShift } from "../audio/theory";
import { playTone, type ToneHandle } from "../audio/playback";
import { PlayButton } from "./PlayButton";
import { PrecisionSlider } from "./PrecisionSlider";

const DEFAULT_VOLUME = 0.3;

export function ReferenceTone() {
  const { state } = useSamplesStore();
  const target = useTargetInfo(state.master);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
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
      <div className="tone-controls">
        <span className="tone-label">Tone Generator</span>
        <PlayButton playing={playing} onClick={toggle} />
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
    </section>
  );
}
