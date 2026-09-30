import { useCallback, useEffect, useRef, useState } from "react";
import { startPad, type PadHandle } from "../audio/player";

/** startPad keys voices by pad number; previews share one key so only one preview plays at a time. */
const PREVIEW_PAD = -1;

/**
 * One-at-a-time sound preview for the classifier and the long-sample warning. Plays the audio as it is
 * (no tuning, no tone) so it starts with minimal latency; release still fades out so stopping never clicks.
 */
export function useSoundPreview() {
  const [playing, setPlaying] = useState<number | null>(null);
  const handle = useRef<PadHandle | null>(null);
  const current = useRef<number | null>(null);

  const stop = useCallback(() => {
    handle.current?.release();
    handle.current = null;
    current.current = null;
    setPlaying(null);
  }, []);

  /** Starts the sound `key` from the start, or stops it if it is already playing. */
  const toggle = useCallback(
    (key: number, channelData: Float32Array[], sampleRate: number) => {
      if (current.current === key) return stop();
      handle.current?.release();
      current.current = key;
      setPlaying(key);
      handle.current = startPad(PREVIEW_PAD, channelData, sampleRate, 0, null, "hold", () => {
        if (current.current === key) {
          current.current = null;
          handle.current = null;
          setPlaying(null);
        }
      });
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { playing, toggle, stop };
}
