import { describe, expect, it } from "vitest";
import { stretchPreview } from "./stretchPreview";
import { fft } from "../classify";
describe("extreme pitch-preserving audition", () => {
  const rate = 8000;
  const tone = Float32Array.from(
    { length: 800 },
    (_, i) => 0.8 * Math.sin((2 * Math.PI * 440 * i) / rate),
  );
  it("stretches a tenth-second tone while retaining its pitch, channels, and original source", () => {
    const before = tone.slice();
    const output = stretchPreview(
      [tone, Float32Array.from(tone, (v) => v * 0.5)],
      rate,
      1,
    );
    expect(output[0].length).toBe(8000);
    const re = Float64Array.from(output[0].subarray(3000, 5048)),
      im = new Float64Array(2048);
    fft(re, im);
    let peak = 1;
    for (let k = 2; k < 1024; k++)
      if (Math.hypot(re[k], im[k]) > Math.hypot(re[peak], im[peak])) peak = k;
    expect(Math.abs((peak * rate) / 2048 - 440)).toBeLessThan(12);
    expect(
      output[0].every((v) => Number.isFinite(v) && Math.abs(v) <= 0.80001),
    ).toBe(true);
    for (let i = 0; i < 8000; i += 97)
      expect(output[1][i]).toBeCloseTo(output[0][i] * 0.5, 5);
    expect(tone).toEqual(before);
  });
  it("blends the end into the continuation of its opening to avoid a hard retrigger", () => {
    const output = stretchPreview([tone], rate, 1)[0];
    const seam = Math.round(rate * 0.02);
    expect(output.at(-1)).toBe(output[seam - 1]);
    expect(Math.abs(output[seam] - output.at(-1)!)).toBeLessThan(0.5);
  });
  it("keeps silence silent", () => {
    const output = stretchPreview([new Float32Array(80)], rate, 0.2)[0];
    expect(output.every((v) => v === 0)).toBe(true);
  });
});
