import { describe, it, expect } from "vitest";
import { allocateKit, generationSlots, matchingTemplateLabel } from "./kitGeneration";
import { layoutById } from "./fingerLayouts";
import type { CategoryId } from "./classify";
const layout = layoutById(null);
const sample = (key: number, category: CategoryId, subtype?: string) => ({
  key,
  category,
  identity: `file:${key}`,
  classification: {
    category,
    subtype,
    confidence: 1,
    needsReview: false,
    evidence: "folder" as const,
  },
});
describe("custom kit generation", () => {
  it("uses the exact Bank A assignments", () => {
    expect(layout.slots.map((s) => s.label)).toEqual([
      "Crash",
      "FX",
      "FX",
      "Noise Fall",
      "Perc",
      "Perc 2",
      "Perc",
      "Sweep",
      "Kick 2",
      "Snare 2",
      "Rim",
      "Clap",
      "Kick 1",
      "Snare 1",
      "Closed Hat",
      "Open Hat 2",
    ]);
  });
  for (const additional of [0, 1, 2] as const)
    it(`fills exactly ${16 * (additional + 1)} requested pads for ${additional} extra banks, never D`, () => {
      const slots = generationSlots(layout, additional);
      const sounds = slots.map((slot, i) =>
        sample(i, slot.category, slot.subtype),
      );
      const allocation = allocateKit(sounds, slots);
      expect(allocation.positions.size).toBe(slots.length);
      expect(allocation.shortages).toEqual([]);
      expect(Math.max(...allocation.positions.values())).toBeLessThan(48);
      expect(new Set(allocation.positions.keys()).size).toBe(
        allocation.positions.size,
      );
    });
  it("reserves rare subtypes before generic slots and clearly reports shortages without substitutions", () => {
    const slots = [
      { category: "snare" as const, label: "Snare" },
      { category: "snare" as const, subtype: "rimshot", label: "Rim" },
      { category: "perc" as const, label: "Perc" },
    ];
    const result = allocateKit(
      [sample(0, "snare", "rimshot"), sample(1, "clap")],
      slots,
    );
    expect(result.positions.get(0)).toBe(1);
    expect(result.positions.has(1)).toBe(false);
    expect(result.shortages.map((gap) => gap.index)).toEqual([0, 2]);
  });
  it("respects locks and excludes duplicate identities even across keys", () => {
    const slots = Array.from({ length: 3 }, () => ({
      category: "fx" as const,
      label: "FX",
    }));
    const result = allocateKit(
      [
        sample(0, "fx"),
        { ...sample(1, "fx"), identity: "file:0" },
        sample(2, "fx"),
      ],
      slots,
      new Set([0]),
      new Set(["file:2"]),
    );
    expect(result.positions.get(0)).toBe(1);
    expect(result.positions.size).toBe(1);
    expect(result.shortages.map((gap) => gap.index)).toEqual([2]);
  });
});

describe("parent Type fallback", () => {
  it("fills missing FX subtypes without using loops or unrelated sounds", () => {
    const sounds = [sample(0, "fx"), sample(1, "fx"), sample(2, "fxLoop"), sample(3, "kick")];
    const result = allocateKit(sounds, [
      { category: "fall", subtype: "noise-fall", label: "Noise Fall" },
      { category: "riser", label: "Riser" },
      { category: "fx", subtype: "sweep", label: "Sweep" },
    ]);
    expect([...result.positions.values()]).toEqual([0, 1]);
    expect(result.shortages.map((gap) => gap.index)).toEqual([2]);
    expect(sounds[0].classification.category).toBe("fx");
  });
  it("reserves an exact riser before a generic FX slot", () => {
    const result = allocateKit([sample(0, "riser"), sample(1, "fx")], [
      { category: "fx", label: "FX" }, { category: "riser", label: "Riser" },
    ]);
    expect(result.positions.get(0)).toBe(1);
    expect(result.positions.get(1)).toBe(0);
  });
  it("fills an unavailable rim with a snare while preserving its classification", () => {
    const sound = sample(0, "snare");
    expect(allocateKit([sound], [{ category: "snare", subtype: "rimshot", label: "Rim" }]).shortages).toEqual([]);
    expect(sound.classification.subtype).toBeUndefined();
  });
});

describe("resolved template labels", () => {
  it("drops subtype labels for a parent Type fallback", () => {
    expect(matchingTemplateLabel({ category: "fall", subtype: "noise-fall", label: "Noise Fall" }, sample(0, "fx"))).toBeUndefined();
    expect(matchingTemplateLabel({ category: "fx", subtype: "sweep", label: "Sweep" }, sample(0, "fx"))).toBeUndefined();
    expect(matchingTemplateLabel({ category: "snare", subtype: "rimshot", label: "Rim" }, sample(0, "snare"))).toBeUndefined();
  });
  it("retains labels for exact matches and repeated generic slots", () => {
    expect(matchingTemplateLabel({ category: "fall", subtype: "noise-fall", label: "Noise Fall" }, sample(0, "fall", "noise-fall"))).toBe("Noise Fall");
    expect(matchingTemplateLabel({ category: "kick", label: "Kick 2" }, sample(0, "kick"))).toBe("Kick 2");
  });
});
