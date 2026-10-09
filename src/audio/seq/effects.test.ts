import { expect, it } from "vitest";
import { softClipCurve, butterworthSectionQs } from "./effects";
it("rounds peaks symmetrically without discontinuities or reversing amplitude", () => {
  const curve = softClipCurve(); const mid = (curve.length - 1) / 2;
  expect(curve[mid]).toBe(0); expect(curve.at(-1)).toBeCloseTo(Math.tanh(4), 6);
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
