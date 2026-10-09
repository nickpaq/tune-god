import { describe, expect, it } from "vitest";
import { baseGrid } from "./chopMarks";
import { applyRhythm, rhythmLength, rhythmMarkers } from "./rhythmLengths";
import { placeCandidate, type WorkspaceState } from "./sectionWorkspace";
import { slotStarts } from "./patternMaker";
const grid = baseGrid(1000, 4, 120, 0);
const empty: WorkspaceState = { chops: [], slots: [], cuts: [] };
describe("repeating chop-start rhythm", () => {
  it("makes two half notes from steps one and nine", () => {
    expect(rhythmMarkers([0, 8], 16)).toEqual([0, 8]);
    expect([0, 8, 16, 24].map((at) => rhythmLength([0, 8], 16, at))).toEqual([
      8, 8, 8, 8,
    ]);
  });
  it("makes quarter notes and all sixteenths without treating spaces as silence", () => {
    expect(
      [0, 4, 8, 12].map((at) => rhythmLength([0, 4, 8, 12], 16, at)),
    ).toEqual([4, 4, 4, 4]);
    const all = Array.from({ length: 16 }, (_, i) => i);
    expect(all.map((at) => rhythmLength(all, 16, at))).toEqual(
      Array(16).fill(1),
    );
    expect([0, 1, 3].map((at) => rhythmLength([0, 1, 3], 16, at))).toEqual([
      1, 2, 13,
    ]);
  });
  it("keeps sixteen steps and scales their subdivisions with loop length", () => {
    for (const bars of [1, 2, 4, 8, 16]) {
      expect(
        rhythmLength(
          Array.from({ length: 16 }, (_, i) => i),
          bars * 16,
          0,
        ),
      ).toBe(bars);
      expect(rhythmLength([0, 8], bars * 16, 0)).toBe(8 * bars);
    }
  });
  it("fills the entire song with its original parts", () => {
    const result = applyRhythm(
      empty,
      { bars: 1, markers: [0, 8], enabled: true },
      grid,
      10000,
    );
    expect(result.slots.map((s) => s.steps)).toEqual(Array(10).fill(8));
    expect(result.slots.every((s) => s.kind === "chop")).toBe(true);
    expect(result.chops.map((c) => c.start)).toEqual(
      Array.from({ length: 10 }, (_, i) => i * 1000),
    );
    expect(slotStarts(result.slots).total).toBe(80);
    expect(empty.chops).toEqual([]);
  });
  it("preserves a swapped source when the rhythm is refined", () => {
    const original = applyRhythm(
      empty,
      { bars: 1, markers: [0, 8], enabled: true },
      grid,
      10000,
    );
    const swapped = placeCandidate(original, original.chops[4], 1, 8);
    const refined = applyRhythm(
      swapped,
      { bars: 1, markers: [0, 4, 8, 12], enabled: true },
      grid,
      10000,
    );
    const at = refined.slots[2];
    expect(at.kind === "chop" && refined.chops[at.chop].start).toBe(4000);
    expect(refined.slots.every((s) => s.steps === 4)).toBe(true);
  });
  it("disables length locking without destroying the prepared sequence", () => {
    const original = applyRhythm(
      empty,
      { bars: 1, markers: [0, 8], enabled: true },
      grid,
      10000,
    );
    const disabled = applyRhythm(
      original,
      { bars: 1, markers: [0, 8], enabled: false },
      grid,
      10000,
    );
    expect(disabled.slots).toBe(original.slots);
    expect(disabled.rhythm?.enabled).toBe(false);
  });
});
