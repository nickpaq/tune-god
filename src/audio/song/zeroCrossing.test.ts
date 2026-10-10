import { describe, expect, it } from "vitest";
import { zeroCrossingNear } from "./zeroCrossing";

describe("zeroCrossingNear", () => {
  const wave = Float32Array.from([0.5, 0.3, 0.1, -0.2, -0.4, -0.1, 0.3, 0.6]);
  it("finds the sample nearest zero at the closest sign change", () => {
    expect(zeroCrossingNear(wave, 4, 5)).toBe(5 - 0); // -0.4 .. -0.1 .. 0.3: crossing between 5 and 6, 5 is closer
    expect(zeroCrossingNear(wave, 1, 5)).toBe(2);
  });
  it("stays put when there is no crossing in reach", () => {
    expect(zeroCrossingNear(Float32Array.from([1, 1, 1, 1]), 2, 3)).toBe(2);
  });
  it("stays inside the sound", () => {
    expect(zeroCrossingNear(wave, 100, 0)).toBe(7);
  });
});
