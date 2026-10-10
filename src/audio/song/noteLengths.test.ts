import { describe, expect, it } from "vitest";
import { NOTE_VALUES, noteLength, noteTicks } from "./noteLengths";

describe("musical length buttons", () => {
  it("offers every regular value from a 64th to one bar and its triplet counterpart", () => {
    expect(NOTE_VALUES.map((n) => noteLength(n.id, false, 4))).toEqual([
      0.25, 0.5, 1, 2, 4, 8, 16,
    ]);
    for (const n of NOTE_VALUES)
      expect(noteLength(n.id, true, 4)).toBeCloseTo(
        (noteLength(n.id, false, 4) * 2) / 3,
        12,
      );
    expect(noteLength("bar", false, 3)).toBe(12);
  });
  it("rounds triplet note endpoints independently without cumulative tick drift", () => {
    const length = noteLength("64", true, 4);
    const notes = Array.from({ length: 96 }, (_, i) =>
      noteTicks(i * length, length, 4096),
    );
    expect(
      notes.every(
        (n) => Number.isInteger(n.start) && Number.isInteger(n.length),
      ),
    ).toBe(true);
    for (let i = 1; i < notes.length; i++)
      expect(notes[i - 1].start + notes[i - 1].length).toBe(notes[i].start);
    expect(notes.at(-1)!.start + notes.at(-1)!.length).toBe(16384);
    expect(notes.slice(0, 3).map((n) => n.length)).toEqual([171, 170, 171]);
  });
});
