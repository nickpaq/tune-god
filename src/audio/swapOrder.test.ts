import { describe, expect, it } from "vitest";
import { rankForSlot, shuffleWithinRuns, sortForSlot } from "./swapOrder";

const sounds = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, group: i < 10 ? "a" : i < 25 ? "b" : "c", index: i }));
const keyOf = (s: { id: string }) => s.id;
const groupOf = (s: { group: string }) => s.group;

describe("shuffleWithinRuns", () => {
  it("keeps the groups in order and reorders inside each", () => {
    const out = shuffleWithinRuns(sounds, keyOf, groupOf, 0.3);
    expect(out.map(groupOf).join("")).toBe(sounds.map(groupOf).join(""));
    expect(out.map(keyOf)).not.toEqual(sounds.map(keyOf));
    expect([...out].sort((a, b) => a.index - b.index)).toEqual(sounds);
  });
  it("holds still for one seed and changes with another", () => {
    const one = shuffleWithinRuns(sounds, keyOf, groupOf, 0.3).map(keyOf);
    expect(shuffleWithinRuns(sounds, keyOf, groupOf, 0.3).map(keyOf)).toEqual(one);
    expect(shuffleWithinRuns(sounds, keyOf, groupOf, 0.7).map(keyOf)).not.toEqual(one);
  });
});

describe("rankForSlot", () => {
  it("puts the slot's own Type first and agrees with sortForSlot", () => {
    expect(rankForSlot("kick", "kick")).toBe(-1);
    expect(rankForSlot("kick", "perc")).toBeLessThan(rankForSlot("kick", "fx"));
    const sorted = sortForSlot([{ category: "fx" as const, index: 0 }, { category: "kick" as const, index: 1 }], "kick");
    expect(sorted[0].category).toBe("kick");
  });
});
