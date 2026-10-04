import { describe, expect, it } from "vitest";
import { assignFill, fillPlan, missingSlots, zoneOf, type FillPad } from "./packFill";
import { layoutById } from "./fingerLayouts";
import type { CategoryId } from "./classify";

const layout = layoutById("horizontal");
const sound = (index: number, category: CategoryId, extra: Partial<FillPad> = {}): FillPad => ({ index, category, ...extra });

describe("zones", () => {
  it("map the pads of a pack's layout", () => {
    expect(zoneOf(12, layout)).toEqual({ kind: "kit", category: "kick" });
    expect(zoneOf(8, layout)).toBeNull(); // the soft kick slot is made from the kick
    expect(zoneOf(16, layout)).toEqual({ kind: "melodicLoop" });
    expect(zoneOf(24, layout)).toEqual({ kind: "melodic" });
    expect(zoneOf(33, layout)).toEqual({ kind: "bass" });
    expect(zoneOf(35, layout)).toEqual({ kind: "808" });
    expect(zoneOf(40, layout)).toEqual({ kind: "rest" });
    expect(zoneOf(48, layout)).toBeNull(); // bank D is the user's
  });
});

describe("missing slots", () => {
  it("are the empty and placeholder slots of banks A to C, never bank D or a ghost slot", () => {
    const pads: Record<number, FillPad> = {};
    for (let i = 0; i < 64; i++) if (i !== 13 && i !== 24 && i !== 40) pads[i] = sound(i, "kick");
    pads[17] = { index: 17, placeholder: {} };
    expect(missingSlots(pads, layout).sort((a, b) => a - b)).toEqual([13, 17, 24, 40]);
    expect(missingSlots({}, layout).every((i) => i < 48)).toBe(true);
  });
});

describe("fill plan", () => {
  it("counts what the gaps want and the spares already held", () => {
    const plan = fillPlan([13, 16, 17, 24, 33, 35, 40, 41, 42], layout, [sound(-1, "snare"), sound(-1, "bass", { is808: true }), sound(-1, "bass")]);
    expect(plan.kitSlots.snare).toBe(1);
    expect(plan.kitSlots.kick).toBe(0 + 0); // 12 is a kick slot; only 13 (snare) was missing
    expect(plan.bankB).toEqual({ melodicLoop: 2, melodic: 1 });
    expect([plan.bassPads, plan.pads808, plan.restPads]).toEqual([1, 1, 3]);
    expect(plan.have).toEqual({ snare: 1, "808": 1, bass: 1 });
  });
});

describe("assigning new sounds to the gaps", () => {
  it("puts each sound in a slot of its own kind and leaves unmatched slots alone", () => {
    const sounds = [
      { category: "snare" as CategoryId },
      { category: "melodic" as CategoryId },
      { category: "bass" as CategoryId, is808: true },
      { category: "drumLoop" as CategoryId },
    ];
    const a = assignFill([13, 12, 24, 25, 34, 40], layout, sounds);
    expect(a.get(13)).toBe(0); // slot 13 is a snare slot
    expect(a.has(12)).toBe(false); // a kick slot, and no kick came
    expect(a.get(24)).toBe(1);
    expect(a.has(25)).toBe(false); // only one melodic
    expect(a.get(34)).toBe(2);
    expect(a.get(40)).toBe(3); // the rest of bank C takes a type with no place of its own
  });

  it("lets a bass slot take an 808 when there is no ordinary bass", () => {
    const a = assignFill([32, 33], layout, [{ category: "bass", is808: true }]);
    expect(a.get(32)).toBe(0);
    expect(a.has(33)).toBe(false);
  });
});
