import { describe, expect, it } from "vitest";
import { PALETTES, colorFor } from "./palettes";
import { roleColors } from "./roleColors";

describe("roleColors", () => {
  it("keeps the palette's kick colour and gives the first nine roles different colours", () => {
    for (const palette of PALETTES) {
      const colors = roleColors(palette);
      expect(colors.kick).toBe(colorFor(palette, "kick"));
      const first = [colors.kick, colors.snare, colors.closedHat, colors.openHat, colors.perc, colors.tom, colors.crash, colors.ride, colors.clap];
      expect(new Set(first).size).toBe(new Set(palette.colors).size >= 9 ? 9 : new Set(palette.colors).size);
    }
  });

  it("separates hats from each other and from the snare in the Koala palette", () => {
    const koala = PALETTES[0];
    const c = roleColors(koala);
    expect(new Set([c.snare, c.closedHat, c.openHat, c.crash]).size).toBe(4);
    expect(c.perc).not.toBe(c.kick);
  });
});
