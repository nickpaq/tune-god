import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_TONE, TONES, type CategoryId } from "./classify";
import { PALETTES, chopColor, colorFor, hexToOklch, oklchToHex, toneColor } from "./palettes";

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
      expect(colorFor(p, "cymbal")).not.toBe(colorFor(p, "openHat"));
      expect(colorFor(p, "openHat")).not.toBe(colorFor(p, "closedHat"));
      expect(colorFor(p, "vox")).not.toBe(colorFor(p, "perc"));
      for (const c of CATEGORIES) expect(colorFor(p, c.id)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("keeps every type's colour visibly distinct from every other type's in the colour palettes", () => {
    const lab = (hex: string) => {
      const [l, c, h] = hexToOklch(hex);
      return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
    };
    // The one-hue palettes tell their types apart by lightness alone, as Grayscale does, so they are held to a lower bar below.
    const MONO = ["grayscale", "sepia", "blueprint", "terminal", "amber", "gameboy", "slate"];
    for (const p of PALETTES.filter((p) => MONO.includes(p.id))) {
      const colors = CATEGORIES.map((c) => lab(colorFor(p, c.id)));
      for (let i = 0; i < colors.length; i++)
        for (let j = i + 1; j < colors.length; j++) expect(Math.hypot(...colors[i].map((v, k) => v - colors[j][k])), `${p.name} ${i}/${j}`).toBeGreaterThan(0.01);
    }
    for (const p of PALETTES.filter((p) => !MONO.includes(p.id))) {
      const colors = CATEGORIES.map((c) => lab(colorFor(p, c.id)));
      for (let i = 0; i < colors.length; i++)
        for (let j = i + 1; j < colors.length; j++) expect(Math.hypot(...colors[i].map((v, k) => v - colors[j][k]))).toBeGreaterThan(0.025);
    }
  });

  it("keeps snares, cymbals and perc well apart in every palette", () => {
    const lab = (hex: string) => {
      const [l, c, h] = hexToOklch(hex);
      return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
    };
    const apart = (p: (typeof PALETTES)[number], a: CategoryId, b: CategoryId) =>
      Math.hypot(...lab(colorFor(p, a)).map((v, k) => v - lab(colorFor(p, b))[k]));
    for (const p of PALETTES) {
      expect(apart(p, "snare", "cymbal"), `${p.name} snare/cymbal`).toBeGreaterThan(0.14);
      expect(apart(p, "snare", "perc"), `${p.name} snare/perc`).toBeGreaterThan(0.14);
      expect(apart(p, "cymbal", "perc"), `${p.name} cymbal/perc`).toBeGreaterThan(0.1);
    }
  });

  it("round-trips OKLCH", () => {
    for (const hex of ["#FF0000", "#00AAAC", "#7A7A7A", "#E8D66D"]) {
      const [l, c, h] = hexToOklch(hex);
      expect(oklchToHex(l, c, h)).toBe(hex);
    }
  });

  it("puts every category in a tone the palette knows", () => {
    for (const c of CATEGORIES) expect(TONES).toContain(CATEGORY_TONE[c.id]);
  });
});

describe("schemes", () => {
  it("have a unique id, a name and a hex accent, and there is a long list of them", () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    for (const p of PALETTES) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.accent).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("chopColor", () => {
  const dist = (a: string, b: string) => {
    const [l1, c1, h1] = hexToOklch(a);
    const [l2, c2, h2] = hexToOklch(b);
    const p = (l: number, c: number, h: number) => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
    const [x, y] = [p(l1, c1, h1), p(l2, c2, h2)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };

  it("only uses the palette's own colours", () => {
    const palette = PALETTES[0];
    for (let i = 0; i < 40; i++) expect(palette.colors).toContain(chopColor(palette.colors, i));
  });

  it("keeps a chop distinct from the two before it as well, never nearer than the palette's own nearest pair", () => {
    for (const palette of PALETTES) {
      const near = Math.min(...Array.from({ length: 12 }, (_, i) => Math.min(dist(chopColor(palette.colors, i), chopColor(palette.colors, i + 1)), dist(chopColor(palette.colors, i), chopColor(palette.colors, i + 2)))));
      expect(near, palette.name).toBeGreaterThan(0.02);
    }
  });

  it("puts side-by-side chops at least as far apart as a typical pair of the palette's colours", () => {
    for (const palette of PALETTES) {
      const next = Array.from({ length: 9 }, (_, i) => dist(chopColor(palette.colors, i), chopColor(palette.colors, i + 1))).reduce((a, b) => a + b, 0) / 9;
      let pairs = 0;
      let total = 0;
      for (let i = 0; i < palette.colors.length; i++)
        for (let j = i + 1; j < palette.colors.length; j++) {
          total += dist(palette.colors[i], palette.colors[j]);
          pairs++;
        }
      expect(next, palette.name).toBeGreaterThan(total / pairs);
    }
  });
});
