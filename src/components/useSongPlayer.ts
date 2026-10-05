import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioContext } from "../audio/decode";
import { prepareBuffer, startPad, type PadHandle } from "../audio/player";

/** startPad keys voices by number: the chop preview has its own, so it never cuts a pad's. */
const PLAY_VOICE = -3;
/** How far ahead (seconds) the beat clicks are scheduled. */
const CLICK_AHEAD = 0.25;

/** A line of the grid that gets a click: its frame, and whether it is a bar's first beat. */
export interface ClickLine {
  frame: number;
  bar: boolean;
}

/**
 * Plays the song from any frame, tells where it is, and clicks on the grid's lines while it plays. `clickLines` is read afresh each time, so the clicks
 * follow the grid as it is nudged. `frameNow` is where the song is as the user hears it (the output's delay taken off), the clock taps are measured on.
 */
export function useSongPlayer(channelData: Float32Array[], sampleRate: number, clickLines: (from: number, to: number) => ClickLine[]) {
  const [playing, setPlaying] = useState(false);
  const handle = useRef<PadHandle | null>(null);
  const timer = useRef(0);
  const [clicks, setClicks] = useState(false);
  /** How loud the clicks are, 0 to 1 (the gain follows the square, so the slider feels even). */
  const [clickVolume, setClickVolume] = useState(0.6);
  const latest = useRef({ clicks, clickVolume, clickLines });
  latest.current = { clicks, clickVolume, clickLines };
  const total = channelData[0].length;

  useEffect(() => {
    const wait = window.setTimeout(() => prepareBuffer(channelData, sampleRate), 400);
    return () => window.clearTimeout(wait);
  }, [channelData, sampleRate]);

  const stop = useCallback(() => {
    window.clearInterval(timer.current);
    handle.current?.cut();
    handle.current = null;
    setPlaying(false);
  }, []);

  const start = useCallback(
    (fromFrame: number) => {
      stop();
      const ctx = getAudioContext();
      if (ctx.state === "suspended") void ctx.resume();
      const h = startPad(PLAY_VOICE, channelData, sampleRate, 0, null, "oneshot", () => {
        if (handle.current === h) stop();
      }, 0, Math.max(0, Math.min(total, fromFrame)) / sampleRate);
      handle.current = h;
      setPlaying(true);
      // Beat clicks, scheduled a little ahead of the playhead, on the grid's own lines.
      let lastClick = fromFrame - 1;
      timer.current = window.setInterval(() => {
        if (!latest.current.clicks) return;
        const now = h.position();
        for (const line of latest.current.clickLines(now * sampleRate, (now + CLICK_AHEAD) * sampleRate)) {
          if (line.frame <= lastClick) continue;
          lastClick = line.frame;
          const at = line.frame / sampleRate;
          if (at < now - 0.02) continue;
          const when = ctx.currentTime + Math.max(0, at - now);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = line.bar ? 1600 : 1000;
          gain.gain.setValueAtTime(Math.max(0.0002, 0.9 * latest.current.clickVolume ** 2), when);
          gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
          osc.connect(gain).connect(ctx.destination);
          osc.start(when);
          osc.stop(when + 0.05);
        }
      }, 40);
    },
    [channelData, sampleRate, stop, total],
  );

  useEffect(() => stop, [stop]);

  /** Where the song is now, in frames, as it is heard: the audio clock less the delay before it reaches the ears. */
  const frameNow = useCallback((): number | null => {
    const h = handle.current;
    if (!h) return null;
    const ctx = getAudioContext();
    const delay = ctx.outputLatency || ctx.baseLatency || 0;
    return (h.position() - delay) * sampleRate;
  }, [sampleRate]);

  /** The same for something that happened `secondsAgo` ago (a tap on the microphone, a press whose event waited in the queue). */
  const frameAgo = useCallback(
    (secondsAgo: number): number | null => {
      const now = frameNow();
      return now === null ? null : now - secondsAgo * sampleRate;
    },
    [frameNow, sampleRate],
  );

  return { playing, start, stop, frameNow, frameAgo, clicks, setClicks, clickVolume, setClickVolume };
}
