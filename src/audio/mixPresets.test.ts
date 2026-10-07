import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./classify";
import { ACTIVE_MIX_PRESET, MIX_PRESETS } from "./mixPresets";

describe.each(Object.values(MIX_PRESETS))("mix preset $name", (preset) => {
  it("has a target loudness for every sound type, with the kick on top and the hats and cymbals under the snare", () => {
    const t = preset.loudness.targetLufs;
    for (const { id } of CATEGORIES) expect(t[id], id).toBeLessThan(0);
    for (const id of Object.keys(t) as (keyof typeof t)[]) if (id !== "kick") expect(t.kick, id).toBeGreaterThan(t[id]);
    for (const id of ["closedHat", "openHat", "cymbal"] as const) expect(t[id], id).toBeLessThan(t.snare);
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
