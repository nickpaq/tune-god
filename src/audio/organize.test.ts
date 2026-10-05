import { describe, expect, it } from "vitest";
import { planOrganize } from "./organize";

describe("planOrganize", () => {
  it("assigns sounds with obvious names and asks about the rest in order", () => {
    const plan = planOrganize([
      { key: 0, name: "Kick_03.wav" },
      { key: 1, name: "sample 12.wav" },
      { key: 2, name: "Snare Tight.wav" },
      { key: 3, name: "xyz.wav" },
      { key: 4, name: "Closed Hat 2.wav" },
      { key: 5, name: "808 Bass E.wav" },
    ]);
    expect(plan.byName.get(0)).toBe("kick");
    expect(plan.byName.get(2)).toBe("snare");
    expect(plan.byName.get(4)).toBe("closedHat");
    expect(plan.byName.get(5)).toBe("bass");
    expect(plan.ask).toEqual([1, 3]);
  });

  it("leaves sounds whose type is already known alone", () => {
    const plan = planOrganize([{ key: 0, name: "mystery.wav", known: true }]);
    expect(plan.byName.size).toBe(0);
    expect(plan.ask).toEqual([]);
  });

  it("asks about nothing when every name is clear", () => {
    expect(planOrganize([{ key: 0, name: "Clap 1.wav" }, { key: 1, name: "Piano Chord.wav" }]).ask).toEqual([]);
  });
});
