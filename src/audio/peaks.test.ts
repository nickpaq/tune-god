import { describe, expect, it } from "vitest";
import { waveformPeaks } from "./peaks";

describe("waveformPeaks", () => {
  it("takes the min and max of each bucket across channels", () => {
    const left = Float32Array.from([0, 0.5, -0.25, 0]);
    const right = Float32Array.from([0, 0, 0, -0.75]);
    const peaks = waveformPeaks([left, right], 2);
    expect(Array.from(peaks)).toEqual([0, 0.5, -0.75, 0]);
  });

  it("returns zeros for an empty sound", () => {
    expect(Array.from(waveformPeaks([new Float32Array(0)], 3))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("has more buckets than samples without crashing", () => {
    const peaks = waveformPeaks([Float32Array.from([1, -1])], 8);
    expect(peaks.length).toBe(16);
  });
});
