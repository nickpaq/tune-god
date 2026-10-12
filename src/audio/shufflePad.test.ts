import { describe, expect, it } from "vitest";
import { chooseShuffleSound } from "./shufflePad";
import type { CategoryId } from "./classify";
const sound = (origIndex: number, category: CategoryId, locked = false) => ({ origIndex, category, locked });
describe("pad shuffle", () => {
  it("shuffles within the same main Type, excluding loops and unrelated drums", () => {
    const fx = sound(1, "fx");
    const otherFx = sound(2, "fx");
    expect(chooseShuffleSound(fx, [fx, sound(3, "kick"), otherFx], () => 0)).toBe(otherFx);
    expect(chooseShuffleSound(fx, [sound(4, "fxLoop")])).toBeUndefined();
    expect(chooseShuffleSound(sound(5, "snare"), [sound(6, "clap"), sound(7, "kick")])).toBeUndefined();
  });
  it("preserves locked sounds and excludes the current sample and duplicate identities", () => {
    const target = { ...sound(1, "kick"), libraryId: "current" };
    const next = { ...sound(2, "kick"), libraryId: "next" };
    const candidates = [target, { ...sound(3, "kick"), libraryId: "current" }, { ...sound(4, "kick", true), libraryId: "locked" }, next, { ...next, origIndex: 5 }];
    expect(chooseShuffleSound(target, candidates, () => 0.99)).toBe(next);
    expect(chooseShuffleSound({ ...target, locked: true }, candidates)).toBeUndefined();
  });
});
