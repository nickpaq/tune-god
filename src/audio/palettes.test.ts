import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_TONE, TONES } from "./classify";
import { PALETTES, colorFor, toneColor } from "./palettes";

describe("palettes", () => {
  it("hold one colour per base tone", () => {
    for (const p of PALETTES) expect(p.colors).toHaveLength(TONES.length);
  });

  it("gives categories in one tone shades of that tone, and distinct colours where the tone differs", () => {
    for (const p of PALETTES) {
      expect(colorFor(p, "kick")).toBe(toneColor(p, "kick"));
      expect(colorFor(p, "closedHat")).toBe(toneColor(p, "hats"));
      expect(colorFor(p, "perc")).toBe(toneColor(p, "percVox"));
      expect(colorFor(p, "snare")).toBe(toneColor(p, "snareClap"));
      expect(colorFor(p, "snare")).not.toBe(colorFor(p, "kick"));
      // Siblings are told apart by shade, and every category gets a valid hex.
      expect(colorFor(p, "snare")).not.toBe(colorFor(p, "kick"));
      expect(colorFor(p, "clap")).not.toBe(colorFor(p, "snare"));
      expect(colorFor(p, "openHat")).not.toBe(colorFor(p, "closedHat"));
      expect(colorFor(p, "vox")).not.toBe(colorFor(p, "perc"));
      for (const c of CATEGORIES) expect(colorFor(p, c.id)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("puts every category in a tone the palette knows", () => {
    for (const c of CATEGORIES) expect(TONES).toContain(CATEGORY_TONE[c.id]);
  });
});
