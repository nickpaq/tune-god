import { describe, expect, it } from "vitest";
import { PALETTES, DEFAULT_PALETTE_ID, paletteById } from "./palettes";
import { accentInk, applyScheme, schemeProperties } from "./theme";

describe("colour schemes applied to the interface", () => {
  it("leaves Graphite's greys alone for the default scheme and sets its lamp colour", () => {
    const props = schemeProperties(paletteById(DEFAULT_PALETTE_ID));
    expect(props["--accent"]).toBe("#ff5b24");
    expect(props["--chassis1"]).toBeNull();
    expect(props["--ink"]).toBeNull();
  });

  it("tints the chassis, keys and menu of a scheme that has a surface hue, and sets its own accent", () => {
    const ocean = PALETTES.find((p) => p.id === "ocean")!;
    const props = schemeProperties(ocean);
    expect(props["--accent"]).toBe(ocean.accent);
    for (const name of ["--stage", "--chassis1", "--key", "--ink"]) expect(props[name]).toMatch(/^#[0-9A-F]{6}$/i);
    expect(props["--chassis1"]).not.toBe("#2A2B2E");
  });

  it("reads white on a dark lamp colour and dark on a light one", () => {
    expect(accentInk("#ff5b24")).toBe("#ffffff");
    expect(accentInk("#f2f2ee")).toBe("#141517");
    expect(accentInk("#ffd21f")).toBe("#141517");
  });

  it("sets and removes properties on the element it is given", () => {
    const set = new Map<string, string>();
    const root = { style: { setProperty: (n: string, v: string) => void set.set(n, v), removeProperty: (n: string) => (set.delete(n) ? "x" : "") } };
    applyScheme(PALETTES.find((p) => p.id === "ocean")!, root);
    expect(set.get("--chassis1")).toBeDefined();
    applyScheme(paletteById(DEFAULT_PALETTE_ID), root);
    expect(set.has("--chassis1")).toBe(false);
    expect(set.get("--accent")).toBe("#ff5b24");
  });
});
