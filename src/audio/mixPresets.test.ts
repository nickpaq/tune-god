import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./classify";
import { ACTIVE_MIX_PRESET, MIX_PRESETS } from "./mixPresets";

describe.each(Object.values(MIX_PRESETS))("mix preset $name", (preset) => {
  it("has a trim of 0 dB or less for every sound type", () => {
    for (const { id } of CATEGORIES) expect(preset.loudness.categoryTrimDb[id], id).toBeLessThanOrEqual(0);
  });

  it("keeps pad EQ highpasses and shelf gains inside Koala's EQ ranges", () => {
    for (const [type, eq] of Object.entries(preset.padEq)) {
      expect(eq.highpassHz, type).toBeGreaterThanOrEqual(20);
      expect(eq.highpassHz, type).toBeLessThanOrEqual(20000);
      if (eq.highShelfDb !== undefined) expect(Math.abs(eq.highShelfDb), type).toBeLessThanOrEqual(18);
    }
  });

  it.each(["dynamic", "loud"] as const)("fits the %s master chain in the five slots of a strip", (style) => {
    expect(preset.master[style].length).toBeLessThanOrEqual(5);
  });

  it("is registered under its own id", () => {
    expect(MIX_PRESETS[preset.id]).toBe(preset);
  });
});

it("has an active preset that is a registered one", () => {
  expect(Object.values(MIX_PRESETS)).toContain(ACTIVE_MIX_PRESET);
});
