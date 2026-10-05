import { describe, expect, it } from "vitest";
import { sliceSection } from "./chop";
import { addCuts, gridBpm, isBarLine, lineFrame, linesBetween, nearestLine, nudgeLine, oddSections, placeLine, planTapSections, resetLine, scalePlans, scaleTapGrid, shiftGrid, toggleCut, type TapGrid } from "./tapGrid";
import { estimateTempo } from "./tapTempo";
import { gridFromTaps } from "./tapGrid";

// 120 BPM at 48 kHz: a beat is 24000 frames, a 4/4 bar 96000.
const grid: TapGrid = { sampleRate: 48000, beatFrames: 24000, originFrame: 12000, beatsPerBar: 4, offsets: {} };

describe("the grid's lines", () => {
  it("puts line n a beat after line n-1, and works out the tempo from the spacing", () => {
    expect(lineFrame(grid, 0)).toBe(12000);
    expect(lineFrame(grid, 3)).toBe(84000);
    expect(lineFrame(grid, -1)).toBe(-12000);
    expect(gridBpm(grid)).toBe(120);
  });

  it("is made from a tap estimate", () => {
    const taps = Array.from({ length: 16 }, (_, i) => 1.25 + i * 0.5);
    const g = gridFromTaps(estimateTempo(taps)!, 48000, 4);
    expect(gridBpm(g)).toBeCloseTo(120, 6);
    expect(lineFrame(g, 0)).toBeCloseTo(1.25 * 48000, 3);
  });

  it("lists the lines between two frames, and finds the nearest", () => {
    expect(linesBetween(grid, 0, 100000)).toEqual([0, 1, 2, 3]);
    expect(nearestLine(grid, 37000)).toBe(1);
    expect(nearestLine(grid, 38000)).toBe(1);
    expect(nearestLine(grid, 49000)).toBe(2);
  });

  it("moves one line on its own", () => {
    const moved = nudgeLine(grid, 2, 480);
    expect(lineFrame(moved, 2)).toBe(60480);
    expect(lineFrame(moved, 1)).toBe(36000);
    expect(lineFrame(moved, 3)).toBe(84000);
    expect(nudgeLine(moved, 2, -480).offsets).toEqual({});
    expect(lineFrame(placeLine(grid, 5, 130000), 5)).toBe(130000);
    expect(resetLine(moved, 2).offsets).toEqual({});
    // the original is untouched
    expect(grid.offsets).toEqual({});
  });

  it("finds a nudged line that has moved into view", () => {
    const moved = nudgeLine(grid, 2, 20000);
    expect(linesBetween(moved, 70000, 90000)).toContain(2);
  });

  it("shifts every line together, nudges included", () => {
    const shifted = shiftGrid(nudgeLine(grid, 2, 100), 480);
    expect(lineFrame(shifted, 0)).toBe(12480);
    expect(lineFrame(shifted, 2)).toBe(60580);
  });

  it("counts bars from the first cut", () => {
    expect(isBarLine(grid, 3, undefined)).toBe(false);
    expect(isBarLine(grid, 3, 3)).toBe(true);
    expect(isBarLine(grid, 7, 3)).toBe(true);
    expect(isBarLine(grid, -1, 3)).toBe(true);
    expect(isBarLine(grid, 5, 3)).toBe(false);
  });
});

describe("cuts", () => {
  it("toggles, keeping them sorted", () => {
    expect(toggleCut([4, 12], 8)).toEqual([4, 8, 12]);
    expect(toggleCut([4, 8, 12], 8)).toEqual([4, 12]);
    expect(addCuts([4, 12], [12, 8, 20])).toEqual([4, 8, 12, 20]);
  });
});

describe("planTapSections", () => {
  const total = 96000 * 20;

  it("cuts from each cut to the next, exactly, with no gap and no overlap", () => {
    const plans = planTapSections(total, grid, [0, 8, 16, 24], { restOfSong: false });
    expect(plans.map((p) => p.start)).toEqual([12000, 12000 + 8 * 24000, 12000 + 16 * 24000]);
    expect(plans.map((p) => p.length)).toEqual([192000, 192000, 192000]);
    expect(plans.map((p) => p.bars)).toEqual([2, 2, 2]);
    plans.slice(1).forEach((p, i) => expect(p.start).toBe(plans[i].start + plans[i].length));
    expect(plans.every((p) => p.audioFrames === p.length)).toBe(true);
    expect(plans.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it("keeps a section whole where the spacing is not a whole number of frames", () => {
    const g = { ...grid, beatFrames: 23999.7, originFrame: 100.4 };
    const plans = planTapSections(total, g, [0, 4, 8, 12, 16], { restOfSong: false });
    plans.slice(1).forEach((p, i) => expect(p.start).toBe(plans[i].start + plans[i].length));
    expect(plans[0].start).toBe(100);
  });

  it("follows a nudged line, and the sections either side of it share its frame", () => {
    const plans = planTapSections(total, nudgeLine(grid, 8, 500), [0, 8, 16], { restOfSong: false });
    expect(plans[0].length).toBe(192500);
    expect(plans[1].start).toBe(plans[0].start + plans[0].length);
    expect(plans[1].length).toBe(191500);
  });

  it("adds the rest of the song after the last cut, padded to whole bars", () => {
    const g = { ...grid, originFrame: 0 };
    const plans = planTapSections(96000 * 2 + 30000, g, [0, 8], { restOfSong: true });
    expect(plans).toHaveLength(2);
    expect(plans[1]).toMatchObject({ start: 192000, bars: 1, length: 96000, audioFrames: 30000 });
    const long = planTapSections(96000 * 2 + 30000, g, [0], { restOfSong: true });
    expect(long[0]).toMatchObject({ start: 0, bars: 3, length: 288000, audioFrames: 96000 * 2 + 30000 });
  });

  it("leaves out a rest of the song that is only a stray tail", () => {
    const g = { ...grid, originFrame: 0 };
    expect(planTapSections(96000 * 2 + 100, g, [0, 8], { restOfSong: true })).toHaveLength(1);
  });

  it("does not cut a section before the first cut, and needs two cuts without the rest of the song", () => {
    expect(planTapSections(total, grid, [], { restOfSong: true })).toEqual([]);
    expect(planTapSections(total, grid, [4], { restOfSong: false })).toEqual([]);
  });

  it("holds a section that is not whole bars for the nearest bars, and says which", () => {
    const plans = planTapSections(total, grid, [0, 8, 18, 26], { restOfSong: false });
    expect(plans.map((p) => p.bars)).toEqual([2, 3, 2]);
    expect(oddSections(grid, [0, 8, 18, 26])).toEqual([2]);
    expect(oddSections(grid, [0, 8, 16])).toEqual([]);
  });

  it("pads a section that starts before the song with silence, to its full length", () => {
    const plans = planTapSections(96000, { ...grid, originFrame: -24000 }, [0, 4], { restOfSong: false });
    expect(plans[0].start).toBe(-24000);
    expect(plans[0].audioFrames).toBe(72000);
    const audio = [new Float32Array(96000).fill(0.5)];
    const cut = sliceSection(audio, plans[0])[0];
    expect(cut).toHaveLength(96000);
    expect(cut[0]).toBe(0);
    expect(cut[24000]).toBe(0.5);
  });
});

describe("scaling to another sample rate", () => {
  it("scales a grid and a plan, keeping sections end to end", () => {
    const scaled = scaleTapGrid(nudgeLine(grid, 2, 480), 44100);
    expect(scaled.beatFrames).toBeCloseTo(22050, 6);
    expect(scaled.offsets[2]).toBeCloseTo(441, 6);
    const plans = planTapSections(96000 * 10, grid, [0, 4, 8, 12], { restOfSong: false });
    const stem = scalePlans(plans, 48000, 44100);
    stem.slice(1).forEach((p, i) => expect(p.start).toBe(stem[i].start + stem[i].length));
    expect(stem[0].start).toBe(11025);
    expect(stem.map((p) => p.bars)).toEqual([1, 1, 1]);
  });
});
