import { describe, expect, it } from "vitest";
import { chooseShuffleSound } from "./shufflePad";
import type { CategoryId } from "./classify";
const sound = (origIndex: number, category: CategoryId, subtype?: string, locked = false) => ({ origIndex, category, classification: { subtype }, locked });
describe("pad shuffle", () => {
  it("replaces a sweep with an impact or other FX when no sweep alternative exists", () => {
    const target = sound(1, "fx", "sweep");
    const impact = sound(2, "fx", "impact");
    expect(chooseShuffleSound(target, [target, sound(3, "kick"), impact], () => 0)).toBe(impact);
    const fall = sound(4, "fall", "noise fall");
    expect(chooseShuffleSound(target, [fall], () => 0)).toBe(fall);
    expect(chooseShuffleSound(target, [sound(5, "fxLoop")])).toBeUndefined();
  });
  it("ignores snare subtypes but never substitutes unrelated drums", () => {
    const rim = sound(1, "snare", "rimshot");
    const snare = sound(2, "snare");
    expect(chooseShuffleSound(rim, [snare], () => 0)).toBe(snare);
    expect(chooseShuffleSound(rim, [sound(3, "clap"), sound(4, "kick")])).toBeUndefined();
  });
  it("preserves locked sounds and excludes the current sample and duplicate identities", () => {
    const target = { ...sound(1, "kick"), libraryId: "current" };
    const next = { ...sound(2, "kick"), libraryId: "next" };
    const candidates = [target, { ...sound(3, "kick"), libraryId: "current" }, { ...sound(4, "kick", undefined, true), libraryId: "locked" }, next, { ...next, origIndex: 5 }];
    expect(chooseShuffleSound(target, candidates, () => 0.99)).toBe(next);
    expect(chooseShuffleSound({ ...target, locked: true }, candidates)).toBeUndefined();
  });
});
