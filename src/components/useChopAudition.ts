import { stretchPreview } from "../audio/song/stretchPreview";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioContext } from "../audio/decode";
import { pieceAudio, type PieceFades } from "../audio/song/sectionWorkspace";
import type { MakerChop } from "../audio/song/patternMaker";

export interface AuditionPiece extends PieceFades {
  chop?: MakerChop;
  steps: number;
  skip?: number;
  stretch?: boolean;
}
export type AuditionKind =
  "candidate" | "browse" | "join" | "sequence" | "stretch";
export function useChopAudition(
  data: Float32Array[],
  sampleRate: number,
  beatFrames: number,
  pitch = 0,
) {
  const [position, setPosition] = useState<{
    kind: AuditionKind;
    steps: number;
  } | null>(null);
  const voices = useRef<AudioBufferSourceNode[]>([]);
  const gains = useRef<GainNode[]>([]);
  const epoch = useRef(0);
  const raf = useRef(0);
  const [volume, setVolume] = useState(0.7);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const stop = useCallback(() => {
    epoch.current++;
    cancelAnimationFrame(raf.current);
    const ctx = voices.current.length ? getAudioContext() : null;
    voices.current.forEach((source, i) => {
      const gain = gains.current[i];
      const cleanup = () => {
        source.disconnect();
        gain?.disconnect();
      };
      if (ctx?.state === "running" && gain) {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.005);
        source.onended = cleanup;
        try {
          source.stop(now + 0.006);
        } catch {
          cleanup();
        }
      } else {
        source.onended = null;
        try {
          source.stop();
        } catch {
          /* already ended */
        }
        cleanup();
      }
    });
    voices.current = [];
    gains.current = [];
    setPosition(null);
  }, []);
  const play = useCallback(
    async (pieces: AuditionPiece[], kind: AuditionKind, origin = 0) => {
      stop();
      const token = epoch.current;
      const ctx = getAudioContext();
      try {
        await ctx.resume();
      } catch {
        return;
      }
      if (token !== epoch.current || !pieces.length) return;
      const rate = 2 ** (pitch / 12);
      const stepSeconds = beatFrames / 4 / sampleRate / rate;
      // Prepare first, then choose a shared clock origin: buffer creation never shifts later joins.
      const cache = new Map<string, AudioBuffer>();
      const buffers = pieces.map((p) => {
        if (!p.chop) return null;
        const key = `${p.chop.start}:${p.chop.length}:${p.steps + (p.skip ?? 0)}:${p.fadeIn}:${p.fadeOut}:${p.stretch}`;
        const reused = cache.get(key);
        if (reused) return reused;
        const raw = pieceAudio(
          data,
          p.chop,
          p.steps + (p.skip ?? 0),
          beatFrames,
          sampleRate,
          p,
        );
        const audio = p.stretch ? stretchPreview(raw, sampleRate) : raw;
        const buffer = ctx.createBuffer(
          audio.length,
          audio[0].length,
          sampleRate,
        );
        audio.forEach((channel, i) =>
          buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, i),
        );
        cache.set(key, buffer);
        return buffer;
      });
      if (token !== epoch.current) return;
      const start = ctx.currentTime + 0.02;
      let at = 0;
      pieces.forEach((piece, i) => {
        const buffer = buffers[i];
        if (buffer) {
          const source = ctx.createBufferSource(),
            gain = ctx.createGain();
          source.buffer = buffer;
          source.playbackRate.value = rate;
          gain.gain.value = volumeRef.current ** 2;
          source.connect(gain).connect(ctx.destination);
          if (piece.stretch) {
            source.loop = true;
            source.loopStart = 0.02;
            source.loopEnd = buffer.duration;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(
              volumeRef.current ** 2,
              start + 0.01,
            );
            source.start(start);
          } else
            source.start(
              start + at * stepSeconds,
              ((piece.skip ?? 0) * beatFrames) / 4 / sampleRate,
              piece.stretch
                ? buffer.duration
                : (piece.steps * beatFrames) / 4 / sampleRate,
            );
          voices.current.push(source);
          gains.current.push(gain);
        }
        at +=
          piece.stretch && buffer
            ? buffer.duration / rate / stepSeconds
            : piece.steps;
      });
      setPosition({ kind, steps: origin });
      const tick = () => {
        if (epoch.current !== token) return;
        const elapsed = Math.max(0, (ctx.currentTime - start) / stepSeconds);
        if (kind !== "stretch" && elapsed >= at) {
          stop();
          return;
        }
        setPosition({ kind, steps: kind === "stretch" ? 0 : origin + elapsed });
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [data, sampleRate, beatFrames, pitch, stop],
  );
  useEffect(() => {
    for (const gain of gains.current) gain.gain.value = volume ** 2;
  }, [volume]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [stop]);
  return { play, stop, position, volume, setVolume };
}
