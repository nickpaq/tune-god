import { describe, expect, it } from "vitest";
import { barLineNear, baseGrid, chopLines, commit, gridWithMarks, markerAt, redo, sectionsBetween, startHistory, tooLong, undo, barsIn } from "./chopMarks";
import { bpmAt, isBarLine, lineFrame, planSections } from "./tapGrid";

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
  const marks = (downbeats: number[], oneOne: number | null = null, tempoScale = 1) => ({ downbeats, oneOne, tempoScale });

  it("is the detected grid with no markers", () => {
    expect(gridWithMarks(base, marks([]))).toBe(base);
  });

  it("tiles backwards as well as forwards from a 1.1.1 set midway through the song", () => {
    const grid = gridWithMarks(base, marks([], 41000)); // 40 beats on from the detected bar 1, 1000 frames late for the grid
    expect(lineFrame(grid, 0)).toBe(41000);
    expect(lineFrame(grid, 4)).toBe(43000);
    expect(lineFrame(grid, -1)).toBe(40500);
    expect(lineFrame(grid, -8)).toBe(37000);
    expect(isBarLine(grid, 0)).toBe(true);
    expect(isBarLine(grid, -4)).toBe(true);
    expect(isBarLine(grid, -3)).toBe(false);
    // the first downbeat of the song is found before it
    expect(barLineNear(grid, 1100)).toBe(-80);
  });

  it("keeps the detected tempo with one anchor", () => {
    const grid = gridWithMarks(base, marks([3040]));
    expect(bpmAt(grid, 0)).toBeCloseTo(120, 9);
    expect(lineFrame(grid, 0)).toBe(3040);
  });

  it("homes in on the exact tempo as downbeat markers are added", () => {
    // the real tempo is 121 BPM (beat 495.87 frames); the detection said 120
    const beat = (60 * RATE) / 121;
    const at = (bars: number) => 2000 + bars * 4 * beat;
    const two = gridWithMarks(base, marks([at(32)], at(0)));
    expect(bpmAt(two, 0)).toBeCloseTo(121, 6);
    const three = gridWithMarks(base, marks([at(32), at(60)], at(0)));
    expect(bpmAt(three, 0)).toBeCloseTo(121, 6);
    // a marker a little off barely moves it
    const off = gridWithMarks(base, marks([at(32) + 8, at(60) - 5], at(0)));
    expect(Math.abs(bpmAt(off, 0) - 121)).toBeLessThan(0.02);
  });

  it("is one tempo for the whole song, each anchor only re-locking the phase", () => {
    const grid = gridWithMarks(base, marks([8030, 16010], 0));
    const beats = new Set(grid.segments.map((s) => s.beatFrames));
    expect(beats.size).toBe(1);
    expect(lineFrame(grid, 16)).toBe(8030);
    expect(Math.abs(lineFrame(grid, 8) - 4000)).toBeLessThan(40);
  });

  it("does not let a stray marker bend the tempo far", () => {
    const grid = gridWithMarks(base, marks([9000], 0)); // 4.5 bars on: counts as 5 bars, a 10 % slower tempo
    expect(Math.abs(bpmAt(grid, 0) - 120)).toBeLessThan(120 * 0.16);
  });

  it("takes the tempo half or double", () => {
    expect(bpmAt(gridWithMarks(base, marks([], null, 2)), 0)).toBeCloseTo(240, 9);
    expect(bpmAt(gridWithMarks(base, marks([], null, 0.5)), 0)).toBeCloseTo(60, 9);
    expect(bpmAt(gridWithMarks(base, marks([], 3000, 2)), 0)).toBeCloseTo(240, 9);
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
    const grid = gridWithMarks(base, { downbeats: [3040], oneOne: null, tempoScale: 1 });
    expect(chopLines(grid, [3000])).toEqual([0]);
    expect(lineFrame(grid, 0)).toBe(3040);
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
