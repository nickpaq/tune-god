import { describe, it, expect } from "vitest";
import { allocateKit, generationSlots, matchingTemplateLabel } from "./kitGeneration";
import { layoutById } from "./fingerLayouts";
import type { CategoryId } from "./classify";
const layout = layoutById(null);
const sample = (key: number, category: CategoryId) => ({
  key,
  category,
  identity: `file:${key}`,
  classification: {
    category,
    confidence: 1,
    needsReview: false,
    evidence: "folder" as const,
  },
});
describe("fixed MPC kit generation", () => {
  it("uses the exact Bank A assignments", () => {
    expect(layout.slots.map((s) => s.label)).toEqual([
      "Cymbal",
      "FX",
      "FX",
      "FX",
      "Perc",
      "Perc 2",
      "Perc",
      "FX",
      "Kick 2",
      "Snare 2",
      "Snare 3",
      "Clap",
      "Kick 1",
      "Snare 1",
      "Closed Hat",
      "Open Hat 2",
    ]);
  });
  it("fills all 48 A–C pads and never D", () => {
      const slots = generationSlots();
      expect(slots).toHaveLength(48);
      const sounds = slots.map((slot, i) =>
        sample(i, slot.category),
      );
      const allocation = allocateKit(sounds, slots);
      expect(allocation.positions.size).toBe(slots.length);
      expect(allocation.shortages).toEqual([]);
      expect(Math.max(...allocation.positions.values())).toBeLessThan(48);
      expect(new Set(allocation.positions.keys()).size).toBe(
        allocation.positions.size,
      );
    });
  it("fills repeated Type slots in order and reports shortages without unrelated substitutions", () => {
    const slots = [
      { category: "snare" as const, label: "Snare" },
      { category: "snare" as const, label: "Snare 3" },
      { category: "perc" as const, label: "Perc" },
    ];
    const result = allocateKit(
      [sample(0, "snare"), sample(1, "clap")],
      slots,
    );
    expect(result.positions.get(0)).toBe(0);
    expect(result.positions.has(1)).toBe(false);
    expect(result.shortages.map((gap) => gap.index)).toEqual([1, 2]);
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

describe("Type-only preset", () => {
  it("uses mixed, organized sound families on both B and C", () => {
    const slots = generationSlots();
    for (const bank of [slots.slice(16, 32), slots.slice(32, 48)]) {
      for (const type of ["bass", "melodic", "vox", "fx", "melodicLoop", "drumLoop"]) expect(bank.some(slot => slot.category === type)).toBe(true);
      expect(bank.slice(12).some(slot => slot.category === "bass")).toBe(true);
    }
    expect(layoutById("old-custom-template")).toBe(layout);
  });
  it("does not substitute loops or unrelated drums for FX", () => {
    const result = allocateKit([sample(0, "fx"), sample(1, "fxLoop"), sample(2, "kick")], [
      { category: "fx", label: "FX" }, { category: "fx", label: "FX" },
    ]);
    expect([...result.positions]).toEqual([[0, 0]]);
    expect(result.shortages.map((gap) => gap.index)).toEqual([1]);
  });
  it("retains matching Type labels only", () => {
    expect(matchingTemplateLabel({ category: "kick", label: "Kick 2" }, sample(0, "kick"))).toBe("Kick 2");
    expect(matchingTemplateLabel({ category: "kick", label: "Kick 2" }, sample(0, "snare"))).toBeUndefined();
  });
});
