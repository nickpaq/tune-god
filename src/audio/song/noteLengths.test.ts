import { describe, expect, it } from "vitest";
import { NOTE_VALUES, noteLength, noteTicks } from "./noteLengths";
import { baseGrid } from "./chopMarks";
import { nextOffset, sourceCandidates } from "./sectionWorkspace";
import { positionText } from "./patternMaker";

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
  it("keeps inherited offsets for mixed straight and triplet 64ths", () => {
    const grid = baseGrid(48000, 4, 120, 0);
    const first = sourceCandidates(
      grid,
      48000 * 32,
      4,
      0,
      noteLength("64", true, 4),
      ["#f00", "#ff0", "#0f0", "#00f"],
    )[0];
    expect(first.steps).toBeCloseTo(1 / 6, 12);
    const offset = nextOffset(
      {
        chops: [first],
        cuts: [],
        slots: [
          { kind: "chop", chop: 0, steps: first.steps },
          { kind: "silence", steps: 0.25 },
        ],
      },
      64,
      grid,
    );
    expect(offset).toBeCloseTo(5 / 12, 12);
    const next = sourceCandidates(grid, 48000 * 32, 4, offset, 0.25, [
      "#f00",
      "#ff0",
      "#0f0",
      "#00f",
    ]);
    expect(next[0].start).toBe(2500);
    expect(next[1].start).toBe(386500);
    expect(positionText(offset, 4)).not.toContain("undefined");
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
