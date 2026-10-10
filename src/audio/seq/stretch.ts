import { stretchPreview } from "../song/stretchPreview";
import type { StretchMode } from "./model";
/** Transient slices keep their original attack; shorter gaps crossfade, longer gaps remain silent. */
export function stretchBeats(
  data: Float32Array[],
  sampleRate: number,
  seconds: number,
): Float32Array[] {
  const length = data[0]?.length ?? 0,
    target = Math.max(1, Math.round(seconds * sampleRate));
  if (!length) return data.map(() => new Float32Array(target));
  const hop = Math.max(1, Math.round(sampleRate * 0.008)),
    starts = [0];
  let previous = 0,
    last = 0;
  for (let i = 0; i < length; i += hop) {
    let energy = 0;
    for (let j = i; j < Math.min(i + hop, length); j++)
      energy += data[0][j] ** 2;
    energy = Math.sqrt(energy / hop);
    if (
      energy > 0.015 &&
      energy > previous * 1.8 &&
      i - last > sampleRate * 0.045
    ) {
      let peak = 0;
      for (let j = i; j < Math.min(i + hop, length); j++)
        peak = Math.max(peak, Math.abs(data[0][j]));
      let onset = i;
      while (
        onset < Math.min(i + hop, length) - 1 &&
        Math.abs(data[0][onset]) < peak * 0.2
      )
        onset++;
      starts.push(onset);
      last = onset;
    }
    previous = previous * 0.5 + energy * 0.5;
  }
  starts.push(length);
  return data.map((channel) => {
    const out = new Float32Array(target);
    for (let n = 0; n < starts.length - 1; n++) {
      const source = starts[n],
        dest = Math.round((source * target) / length);
      const next = Math.round((starts[n + 1] * target) / length);
      const count = Math.min(
        starts[n + 1] - source,
        next - dest,
        target - dest,
      );
      const fade = Math.min(
        Math.round(sampleRate * 0.003),
        Math.floor(count / 3),
      );
      for (let i = 0; i < count; i++)
        out[dest + i] =
          channel[source + i] *
          (i >= count - fade ? (count - i) / Math.max(1, fade) : 1);
    }
    return out;
  });
}
export function renderStretch(
  data: Float32Array[],
  sampleRate: number,
  seconds: number,
  mode: StretchMode,
): Float32Array[] {
  if (mode === "modern") return stretchPreview(data, sampleRate, seconds);
  if (mode === "beats") return stretchBeats(data, sampleRate, seconds);
  return data;
}
