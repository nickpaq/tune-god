import { describe, expect, it } from "vitest";
import { buildPyramid, columnPeaks } from "./waveform";

/** A signal with one known spike, so any view that contains it must show it, at any zoom. */
function song(frames: number, spikeAt: number, spike = 0.9) {
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i++) data[i] = 0.1 * Math.sin(i / 50);
  data[spikeAt] = spike;
  return [data];
}

describe("columnPeaks", () => {
  it("never loses a spike, whatever the zoom", () => {
    const total = 3_000_000;
    const spikeAt = 1_234_567;
    const pyramid = buildPyramid(song(total, spikeAt));
    expect(pyramid.peak).toBeCloseTo(0.9, 6);
    for (const span of [total, total / 2, 400_000, 30_000, 4_000, 360]) {
      const start = spikeAt - span / 3;
      const lo = new Float32Array(360);
      const hi = new Float32Array(360);
      columnPeaks(pyramid, start, span, 360, lo, hi);
      expect(Math.max(...hi)).toBeCloseTo(0.9, 6);
    }
  });

  it("puts the spike in the right column at the closest zoom", () => {
    const pyramid = buildPyramid(song(100_000, 50_000));
    const lo = new Float32Array(360);
    const hi = new Float32Array(360);
    columnPeaks(pyramid, 50_000 - 180, 360, 360, lo, hi);
    expect(hi.indexOf(Math.max(...hi))).toBe(180);
  });

  it("is silent outside the song", () => {
    const pyramid = buildPyramid(song(1000, 500));
    const lo = new Float32Array(10);
    const hi = new Float32Array(10);
    columnPeaks(pyramid, -5000, 1000, 10, lo, hi);
    expect([...hi, ...lo].every((v) => v === 0)).toBe(true);
  });

  it("shows the same loudest point whether it reads the audio itself or the pyramid", () => {
    const pyramid = buildPyramid(song(200_000, 99_999));
    const read = (span: number) => {
      const lo = new Float32Array(100);
      const hi = new Float32Array(100);
      columnPeaks(pyramid, 99_999 - span / 2, span, 100, lo, hi);
      return Math.max(...hi);
    };
    // 63 frames a pixel reads the audio, 65 reads the first level
    expect(read(100 * 63)).toBeCloseTo(0.9, 6);
    expect(read(100 * 65)).toBeCloseTo(0.9, 6);
  });
});
