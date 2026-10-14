import { useEffect, useMemo, useRef } from "react";
import { waveformPeaks } from "../audio/peaks";

const BUCKETS = 240;

/** The selected sound's waveform, scaled so its loudest peak fills the height. Drawn in the screen's ink colour. */
export function Waveform({ channelData, playbackPosition, playbackKey = 0 }: { channelData: Float32Array[]; playbackPosition?: () => number | null; playbackKey?: number }) {
  const playhead = useRef<HTMLDivElement>(null);
  const position = useRef(playbackPosition);
  position.current = playbackPosition;
  const canvas = useRef<HTMLCanvasElement>(null);
  const peaks = useMemo(() => waveformPeaks(channelData, BUCKETS), [channelData]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(el.clientWidth * ratio));
      const h = Math.max(1, Math.round(el.clientHeight * ratio));
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const ink = getComputedStyle(el).color;
      let peak = 0;
      for (const v of peaks) peak = Math.max(peak, Math.abs(v));
      const scale = peak > 0 ? 1 / peak : 1;
      const mid = h / 2;
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, Math.floor(mid), w, Math.max(1, Math.round(ratio)));
      ctx.globalAlpha = 1;
      const col = w / BUCKETS;
      for (let b = 0; b < BUCKETS; b++) {
        const top = mid - peaks[b * 2 + 1] * scale * mid * 0.92;
        const bottom = mid - peaks[b * 2] * scale * mid * 0.92;
        ctx.fillRect(Math.floor(b * col), top, Math.max(1, Math.ceil(col) - (col > 3 ? 1 : 0)), Math.max(1, bottom - top));
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [peaks]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const value = position.current?.() ?? null;
      const line = playhead.current;
      if (line) {
        line.hidden = value === null;
        if (value !== null) line.style.left = `${Math.max(0, Math.min(1, value)) * 100}%`;
      }
      if (value !== null) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playbackKey, channelData]);

  return <div className="waveform" role="img" aria-label="Waveform">
    <canvas ref={canvas} className="waveform__canvas" />
    <div ref={playhead} className="waveform__playhead" hidden aria-hidden="true" />
  </div>;
}
