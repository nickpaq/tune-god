import { describe, expect, it } from "vitest";
import { bassLiftSemitones } from "./theory";

describe("bassLiftSemitones", () => {
  it("lifts a low bass by whole octaves up to the tone's octave", () => {
    // E1 (MIDI 28) against a tone on E (pitch class 4): E4 is 64, three octaves up
    expect(bassLiftSemitones(28, 4)).toBe(36);
  });

  it("is always a whole number of octaves, so the note does not change", () => {
    for (const midi of [24, 31.4, 40, 47.9, 55])
      for (let pc = 0; pc < 12; pc++) expect(bassLiftSemitones(midi, pc) % 12).toBe(0);
  });

  it("never lowers a sound that is already at or above the tone", () => {
    expect(bassLiftSemitones(72, 0)).toBe(0);
    expect(bassLiftSemitones(60, 0)).toBe(0);
  });
});
