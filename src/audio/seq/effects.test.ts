import { expect, it } from "vitest";
import { softClipCurve, butterworthSectionQs, samplerColourCurve } from "./effects";
it("rounds peaks symmetrically without discontinuities or reversing amplitude", () => {
  const curve = softClipCurve(); const mid = (curve.length - 1) / 2;
  expect(curve[mid]).toBe(0); expect(curve.at(-1)).toBeCloseTo(Math.tanh(1), 6);
  for (let i = 0; i < curve.length; i++) {
    expect(curve[i]).toBeCloseTo(-curve[curve.length - 1 - i], 6);
    if (i) expect(curve[i]).toBeGreaterThan(curve[i - 1]);
  }
});

it("uses distinct Butterworth pole pairs rather than repeated identical filters", () => {
  expect(butterworthSectionQs(4)).toEqual([1 / (2 * Math.cos(Math.PI / 8)), 1 / (2 * Math.cos(3 * Math.PI / 8))]);
  const qs = butterworthSectionQs(8);
  expect(qs).toHaveLength(4);
  expect(qs[0]).toBeCloseTo(0.5097955791, 8);
  expect(qs[3]).toBeCloseTo(2.5629154477, 8);
  // At cutoff each second-order section has magnitude Q; combined response is -3.01 dB.
  expect(qs.reduce((product, q) => product * q, 1)).toBeCloseTo(Math.SQRT1_2, 10);
});

it("keeps sampler colour centred, bounded and bypassable", () => {
  const curve = samplerColourCurve(1); const dry = samplerColourCurve(0);
  expect(curve[(curve.length - 1) / 2]).toBe(0);
  expect(curve[0]).toBe(-1); expect(curve.at(-1)).toBe(1);
  for (let i = 0; i < curve.length; i += 97) {
    expect(Math.abs(curve[i])).toBeLessThanOrEqual(1);
    expect(curve[i]).toBeCloseTo(-curve[curve.length - 1 - i], 6);
    expect(dry[i]).toBeCloseTo(i * 2 / (curve.length - 1) - 1, 6);
  }
});

it("lets bit reduction and warmth be disabled independently", () => {
  const bypass = samplerColourCurve(1, false, false);
  const bits = samplerColourCurve(1, true, false);
  const warmth = samplerColourCurve(1, false, true);
  const i = 45000; const x = i * 2 / (bypass.length - 1) - 1;
  expect(bypass[i]).toBeCloseTo(x, 7);
  expect(bits[i]).toBeCloseTo(Math.round(x * 2047) / 2047, 7);
  expect(warmth[i]).toBeCloseTo(Math.tanh(x * 3) / Math.tanh(3), 7);
});
