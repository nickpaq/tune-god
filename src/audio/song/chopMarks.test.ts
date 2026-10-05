import { describe, expect, it } from "vitest";
import { barLineNear, baseGrid, chopLines, commit, gridWithMarks, markerAt, redo, sectionsBetween, startHistory, tooLong, undo, barsIn } from "./chopMarks";
import { isBarLine, lineFrame, planSections } from "./tapGrid";

const RATE = 1000;
// 120 BPM: a beat is 500 frames, a 4/4 bar 2000, bar 1 at 1 s.
const base = baseGrid(RATE, 4, 120, 1);

describe("baseGrid", () => {
  it("puts bar 1 on the detected downbeat", () => {
    expect(lineFrame(base, 0)).toBe(1000);
    expect(lineFrame(base, 4)).toBe(3000);
    expect(isBarLine(base, 0)).toBe(true);
    expect(isBarLine(base, 1)).toBe(false);
    expect(isBarLine(base, 4)).toBe(true);
  });
});

describe("gridWithMarks", () => {
  const none = { downbeats: [], oneOne: null };

  it("is the detected grid with no markers", () => {
    expect(gridWithMarks(base, none)).toBe(base);
  });

  it("keeps the detected bar 1 when only downbeat markers are placed", () => {
    const grid = gridWithMarks(base, { downbeats: [3040], oneOne: null });
    expect(isBarLine(grid, 0)).toBe(true);
    expect(isBarLine(grid, 4)).toBe(true);
    expect(isBarLine(grid, 1)).toBe(false);
  });

  it("puts the lines after a downbeat marker on the marker, keeping the tempo", () => {
    const grid = gridWithMarks(base, { downbeats: [3040], oneOne: null }); // bar 2 is 40 frames late
    expect(lineFrame(grid, 4)).toBe(3040);
    expect(lineFrame(grid, 5)).toBe(3540);
    expect(lineFrame(grid, 3)).toBe(2500); // before it nothing moves
  });

  it("re-locks at each marker, whatever order they were placed in", () => {
    const a = gridWithMarks(base, { downbeats: [3040, 7100], oneOne: null });
    const b = gridWithMarks(base, { downbeats: [7100, 3040], oneOne: null });
    for (const grid of [a, b]) {
      expect(lineFrame(grid, 12)).toBe(7100);
      expect(lineFrame(grid, 8)).toBe(5040);
    }
  });

  it("counts the bars from the 1.1.1, which can sit before the first downbeat marker", () => {
    // the grid is locked in on a bar later in the song, then 1.1.1 is set on the second beat of the detection's first bar
    const grid = gridWithMarks(base, { downbeats: [7100], oneOne: 1500 });
    expect(isBarLine(grid, 1)).toBe(true);
    expect(isBarLine(grid, 0)).toBe(false);
    expect(isBarLine(grid, 5)).toBe(true);
    expect(lineFrame(grid, 12)).toBe(7100);
  });
});

describe("chop markers", () => {
  it("snap to the nearest bar line", () => {
    expect(barLineNear(base, 3100)).toBe(4);
    expect(barLineNear(base, 3900)).toBe(4);
    expect(barLineNear(base, 4100)).toBe(8);
    expect(barLineNear(base, 100)).toBe(0);
  });

  it("follow the grid when a downbeat marker shifts it", () => {
    const grid = gridWithMarks(base, { downbeats: [3040], oneOne: null });
    expect(chopLines(grid, [3000])).toEqual([4]);
    expect(lineFrame(grid, 4)).toBe(3040);
  });

  it("are listed once each, in song order", () => {
    expect(chopLines(base, [7000, 3000, 3050])).toEqual([4, 12]);
  });

  it("make a section between each neighbouring pair, in whole bars", () => {
    const lines = chopLines(base, [1000, 5000, 13000]);
    const sections = sectionsBetween(lines);
    expect(sections.map((s) => barsIn(base, s))).toEqual([2, 4]);
    expect(sections.map((s) => s.colorIndex)).toEqual([0, 1]);
  });

  it("make no section from fewer than two", () => {
    expect(sectionsBetween([])).toEqual([]);
    expect(sectionsBetween([4])).toEqual([]);
  });

  it("are planned end to end with nothing lost or doubled", () => {
    const sections = sectionsBetween(chopLines(base, [1000, 5000, 13000]));
    const plans = planSections(20000, base, sections);
    expect(plans.map((p) => [p.start, p.length, p.bars])).toEqual([
      [1000, 4000, 2],
      [5000, 8000, 4],
    ]);
  });

  it("flags a section longer than 16 bars", () => {
    const [short, long] = sectionsBetween(chopLines(base, [1000, 33000, 70000]));
    expect(tooLong(base, short)).toBe(false); // 16 bars exactly
    expect(tooLong(base, long)).toBe(true);
  });
});

describe("markerAt", () => {
  it("finds the nearest marker within the tolerance", () => {
    expect(markerAt([100, 500, 520], 505, 30)).toBe(500);
    expect(markerAt([100, 500], 300, 30)).toBeNull();
    expect(markerAt([], 300, 30)).toBeNull();
  });
});

describe("history", () => {
  it("goes back and forward", () => {
    let h = startHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe(1);
    h = redo(redo(h));
    expect(h.present).toBe(2);
  });

  it("forgets what was undone once something new is done", () => {
    let h = commit(commit(startHistory(0), 1), 2);
    h = undo(h);
    h = commit(h, 9);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
    expect(undo(h).present).toBe(1);
  });
});
