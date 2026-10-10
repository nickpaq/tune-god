import { describe, expect, it } from "vitest";
import { koalaPitch, totalPitch } from "./pitchWrap";

describe("Koala pitch knob fitting", () => {
  it("adds the automatic and manual adjustments once", () => {
    expect(totalPitch(3, 1, 25)).toBe(4.25);
    expect(totalPitch(-5, 0, -50)).toBe(-5.5);
  });
  it("keeps values the knob can reach, exactly", () => {
    for (const v of [-12, -7.5, 0, 0.01, 12]) expect(koalaPitch(v)).toEqual({ intended: v, knob: v, octaveError: 0, exact: true });
  });
  it("wraps larger values by octaves into range and says the octave changed", () => {
    expect(koalaPitch(13)).toMatchObject({ knob: 1, octaveError: 12, exact: false });
    expect(koalaPitch(-13)).toMatchObject({ knob: -1, octaveError: -12, exact: false });
    expect(koalaPitch(14.5)).toMatchObject({ knob: 2.5, exact: false });
    expect(koalaPitch(-25)).toMatchObject({ knob: -1, octaveError: -24 });
  });
  it("keeps the pitch class and never leaves -12..12", () => {
    for (let v = -48; v <= 48; v += 0.25) {
      const k = koalaPitch(v);
      expect(Math.abs(k.knob)).toBeLessThanOrEqual(12);
      expect(Math.abs(((k.intended - k.knob) % 12) / 12)).toBeCloseTo(0, 5);
    }
  });
});
