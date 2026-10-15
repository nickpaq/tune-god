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
  it("matches Types first, then fills gaps with available Types", () => {
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
    expect(result.positions.get(1)).toBe(1);
    expect(result.shortages.map((gap) => gap.index)).toEqual([2]);
  });
  it("preserves locked slots while filling gaps with available sounds", () => {
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
    expect(result.positions.size).toBe(2);
    expect([...result.positions.values()]).not.toContain(0);
    expect(result.shortages).toEqual([]);
  });
});

describe("Type-only preset", () => {
  it("uses mixed, organized sound families on both B and C", () => {
    const slots = generationSlots();
    for (const bank of [slots.slice(16, 32), slots.slice(32, 48)]) {
      for (const type of ["bass", "melodic", "vox", "melodicLoop"]) expect(bank.some(slot => slot.category === type)).toBe(true);
      expect(bank.slice(12).some(slot => slot.category === "bass")).toBe(true);
    }
    expect(layoutById("old-custom-template")).toBe(layout);
  });
  it("gives every Type on banks B and C an even number of pads, side by side in its row", () => {
    const slots = generationSlots().slice(16);
    const counts = new Map<string, number>();
    for (const slot of slots) counts.set(slot.category, (counts.get(slot.category) ?? 0) + 1);
    for (const [type, n] of counts) { expect(n % 2, type).toBe(0); expect(n, type).toBeGreaterThanOrEqual(2); }
    for (let row = 0; row < slots.length; row += 4) {
      const kinds = slots.slice(row, row + 4).map((s) => s.category);
      expect(kinds[0] === kinds[1] && kinds[2] === kinds[3]).toBe(true);
    }
  });
  it("never leaves an odd number of one Type on B and C when the library is short, and keeps the Types together", () => {
    const slots = generationSlots();
    // 3 melodic loops for 8 slots, one vox, and plenty of melodic one-shots and bass
    const sounds = [
      ...[0, 1, 2].map((k) => sample(k, "melodicLoop")), sample(3, "vox"),
      ...Array.from({ length: 12 }, (_, i) => sample(10 + i, "melodic")),
      ...Array.from({ length: 6 }, (_, i) => sample(40 + i, "bass")),
    ];
    const { positions } = allocateKit(sounds, slots, new Set(), new Set(), () => 0);
    const byType = new Map<string, number[]>();
    for (const sound of sounds) {
      const at = positions.get(sound.key);
      if (at !== undefined && at >= 16) byType.set(sound.category, [...(byType.get(sound.category) ?? []), at]);
    }
    for (const [type, at] of byType) expect(at.length % 2, type).toBe(0);
    // the filled pads of each row are one Type or two pairs, never a scatter of singles
    for (let row = 16; row < 48; row += 4) {
      const kinds = [0, 1, 2, 3].map((n) => [...positions].find(([, i]) => i === row + n)).map((e) => e && sounds.find((s) => s.key === e[0])!.category);
      expect(kinds[0] === undefined, `row at ${row}`).toBe(kinds[1] === undefined);
      expect(kinds[2] === undefined, `row at ${row}`).toBe(kinds[3] === undefined);
    }
  });
  it("fills a whole empty group of four from one Type when there are enough", () => {
    const slots = generationSlots().slice(16, 20); // four melodic loops
    const sounds = Array.from({ length: 6 }, (_, i) => sample(i, "fx")).concat(Array.from({ length: 6 }, (_, i) => sample(10 + i, "snare")));
    const { positions } = allocateKit(sounds, slots.map((slot) => ({ ...slot })), new Set(), new Set(), () => 0);
    const types = [...positions.keys()].map((key) => sounds.find((s) => s.key === key)!.category);
    expect(types).toHaveLength(4);
    expect(new Set(types).size).toBe(1);
  });
  it("fills missing FX with another available Type without relabeling it", () => {
    const result = allocateKit([sample(0, "fx"), sample(1, "fxLoop"), sample(2, "kick")], [
      { category: "fx", label: "FX" }, { category: "fx", label: "FX" },
    ], new Set(), new Set(), () => 0);
    expect([...result.positions]).toEqual([[0, 0], [1, 1]]);
    expect(result.shortages).toEqual([]);
    expect(matchingTemplateLabel({ category: "fx", label: "FX" }, sample(1, "fxLoop"))).toBeUndefined();
  });
  it("retains matching Type labels only", () => {
    expect(matchingTemplateLabel({ category: "kick", label: "Kick 2" }, sample(0, "kick"))).toBe("Kick 2");
    expect(matchingTemplateLabel({ category: "kick", label: "Kick 2" }, sample(0, "snare"))).toBeUndefined();
  });
});

describe("808s for missing kick pads", () => {
  const e808 = (key: number) => ({ ...sample(key, "bass"), is808: true });
  const slots = generationSlots();
  it("puts 808s on the bottom-left pad and the one above it when there are no kicks", () => {
    const { positions } = allocateKit([sample(1, "snare"), e808(2), e808(3), sample(4, "bass")], slots);
    expect(positions.get(2)).toBe(12);
    expect(positions.get(3)).toBe(8);
  });
  it("prefers real kicks, and uses an 808 only for the pad a kick does not fill", () => {
    const { positions } = allocateKit([sample(1, "kick"), e808(2)], slots);
    expect(positions.get(1)).toBe(8);
    expect(positions.get(2)).toBe(12);
  });
});

describe("kick pads with no kicks and no 808s", () => {
  it("takes other drums, never vocals, before the general fill", () => {
    const { positions } = allocateKit([sample(1, "vox"), ...[2, 3, 4, 5, 6].map((k) => sample(k, "snare"))], generationSlots(), new Set(), new Set(), () => 0);
    const drumOnKick = [12, 8].map((i) => [...positions].find(([, at]) => at === i)?.[0]);
    expect(drumOnKick.every((key) => key !== undefined && key !== 1)).toBe(true);
  });
});
