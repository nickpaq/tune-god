import { describe, expect, it } from "vitest";
import { classifyDetail, padLabel } from "./padLabels";

describe("classifyDetail", () => {
  it("finds a keyword label for non-drum categories", () => {
    expect(classifyDetail("Warm_Rhodes_C3.wav", "melodic")?.text).toBe("Piano");
    expect(classifyDetail("big-riser.wav", "fx")?.text).toBe("Riser");
    expect(classifyDetail("sub_808.wav", "bass")?.text).toBe("808");
  });
  it("returns undefined when nothing matches", () => {
    expect(classifyDetail("sample 12.wav", "melodic")).toBeUndefined();
  });
});

describe("padLabel", () => {
  it("uses the drum role for drums", () => {
    expect(padLabel({ category: "hat", drumRole: "openHat" })).toBe("Open Hat");
    expect(padLabel({ category: "perc", drumRole: "tom" })).toBe("Tom");
  });
  it("uses the detail only while it matches the category", () => {
    const detail = { category: "melodic" as const, text: "Piano" };
    expect(padLabel({ category: "melodic", detail })).toBe("Piano");
    expect(padLabel({ category: "bass", detail })).toBe("Bass");
  });
  it("falls back to the category label", () => {
    expect(padLabel({ category: "vocal" })).toBe("Vocal");
    expect(padLabel({})).toBe("Other");
  });
});
