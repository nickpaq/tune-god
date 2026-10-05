import { describe, expect, it } from "vitest";
import { sliceSection } from "./chop";
import { beatFramesAt, bpmAt, gridFromTaps, inOrder, isBarLine, limitEnd, lineFrame, linesBetween, lineNear, maxBeats, nudgeLine, oddSections, placeLine, planSections, realignGrid, resetLine, scalePlans, setDownbeat, shiftGrid, type TapGrid } from "./tapGrid";
import { estimateTempo, refineWithTransients } from "./tapTempo";

// 120 BPM at 48 kHz: a beat is 24000 frames, a 4/4 bar 96000.
const grid: TapGrid = { sampleRate: 48000, beatsPerBar: 4, segments: [{ line: 0, frame: 12000, beatFrames: 24000 }], offsets: {}, downbeats: [] };

describe("the grid's lines", () => {
  it("puts line n a beat after line n-1, and works out the tempo from the spacing", () => {
    expect(lineFrame(grid, 0)).toBe(12000);
    expect(lineFrame(grid, 3)).toBe(84000);
    expect(lineFrame(grid, -1)).toBe(-12000);
    expect(bpmAt(grid, 5)).toBe(120);
    expect(maxBeats(grid)).toBe(64);
  });

  it("is made from a tap estimate", () => {
    const taps = Array.from({ length: 16 }, (_, i) => 1.25 + i * 0.5);
    const g = gridFromTaps(estimateTempo(taps)!, 48000, 4);
    expect(bpmAt(g, 0)).toBeCloseTo(120, 6);
    expect(lineFrame(g, 0)).toBeCloseTo(1.25 * 48000, 3);
    expect(g.downbeats).toEqual([]);
  });

  it("lists the lines between two frames, and finds the nearest", () => {
    expect(linesBetween(grid, 0, 100000)).toEqual([0, 1, 2, 3]);
    expect(lineNear(grid, 37000)).toBe(1);
    expect(lineNear(grid, 49000)).toBe(2);
  });

  it("moves one line on its own", () => {
    const moved = nudgeLine(grid, 2, 480);
    expect(lineFrame(moved, 2)).toBe(60480);
    expect(lineFrame(moved, 1)).toBe(36000);
    expect(lineFrame(moved, 3)).toBe(84000);
    expect(nudgeLine(moved, 2, -480).offsets).toEqual({});
    expect(lineFrame(placeLine(grid, 5, 130000), 5)).toBe(130000);
    expect(resetLine(moved, 2).offsets).toEqual({});
    expect(grid.offsets).toEqual({});
  });

  it("finds a nudged line that has moved into view", () => {
    expect(linesBetween(nudgeLine(grid, 2, 20000), 70000, 90000)).toContain(2);
  });

  it("shifts every line together, nudges included", () => {
    const shifted = shiftGrid(nudgeLine(grid, 2, 100), 480);
    expect(lineFrame(shifted, 0)).toBe(12480);
    expect(lineFrame(shifted, 2)).toBe(60580);
  });
});

describe("1.1.1 and the accents", () => {
  it("has no accents until a downbeat is set", () => {
    expect(isBarLine(grid, 3)).toBe(false);
  });

  it("counts bars from the downbeat, backwards too", () => {
    const g = setDownbeat(grid, 3);
    expect(isBarLine(g, 3)).toBe(true);
    expect(isBarLine(g, 7)).toBe(true);
    expect(isBarLine(g, -1)).toBe(true);
    expect(isBarLine(g, 5)).toBe(false);
  });

  it("changes the accents only after a later downbeat, leaving the ones before as they were", () => {
    const first = setDownbeat(grid, 0);
    const later = setDownbeat(first, 18); // a bar of two beats was dropped: the downbeat moves
    expect(later.downbeats).toEqual([0, 18]);
    expect([0, 4, 8, 12, 16].every((n) => isBarLine(later, n))).toBe(true);
    expect(isBarLine(later, 17)).toBe(false);
    expect(isBarLine(later, 16)).toBe(true);
    expect(isBarLine(later, 18)).toBe(true);
    expect(isBarLine(later, 20)).toBe(false);
    expect(isBarLine(later, 22)).toBe(true);
    expect(isBarLine(later, 4 + 18 + 18)).toBe(false);
    // setting the same line again changes nothing
    expect(setDownbeat(later, 18).downbeats).toEqual([0, 18]);
  });
});

describe("tapping again later: tempo segments", () => {
  it("follows the new tempo from the line nearest the new taps, leaving the ones before", () => {
    // from beat 100 on, 130 BPM: a beat is 22153.846 frames
    const at = lineFrame(grid, 100);
    const beat = (60 * 48000) / 130;
    const g = realignGrid(nudgeLine(grid, 110, 400), { origin: at + 300, beatFrames: beat });
    expect(g.segments).toHaveLength(2);
    expect(lineFrame(g, 99)).toBe(lineFrame(grid, 99));
    expect(lineFrame(g, 100)).toBeCloseTo(at + 300, 6);
    expect(lineFrame(g, 104)).toBeCloseTo(at + 300 + 4 * beat, 6);
    expect(bpmAt(g, 99)).toBe(120);
    expect(bpmAt(g, 150)).toBeCloseTo(130, 6);
    expect(beatFramesAt(g, 100)).toBeCloseTo(beat, 6);
    // the nudge on a line after the realigned point is gone
    expect(g.offsets).toEqual({});
  });

  it("lists lines across the join in order, and finds the nearest on either side", () => {
    const g = realignGrid(grid, { origin: lineFrame(grid, 10) + 500, beatFrames: 20000 });
    const lines = linesBetween(g, lineFrame(grid, 8), lineFrame(grid, 8) + 6 * 22000);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(lines.slice(0, 3)).toEqual([8, 9, 10]);
    expect(lineNear(g, lineFrame(g, 12) + 100)).toBe(12);
    expect(lineNear(g, lineFrame(g, 9) + 100)).toBe(9);
  });

  it("a later realign replaces the segments after it", () => {
    const one = realignGrid(grid, { origin: lineFrame(grid, 20), beatFrames: 20000 });
    const two = realignGrid(one, { origin: lineFrame(one, 10), beatFrames: 25000 });
    expect(two.segments.map((s) => s.line)).toEqual([0, 10]);
  });
});

describe("refineWithTransients", () => {
  it("makes a finger's taps exact with the attacks near them", () => {
    // beats at 0.037 + 0.5k exactly; the taps are up to 30 ms out; the audio's attacks are on the beats
    const truth = (n: number) => 0.037 + 0.5 * n;
    const jitter = [0.02, -0.03, 0.01, 0.028, -0.015, 0.0, -0.022, 0.03, -0.01, 0.012, -0.027, 0.018];
    const taps = jitter.map((j, n) => truth(n) + j);
    const e = estimateTempo(taps)!;
    const snap = (frame: number, radius: number) => {
      const n = Math.round((frame / 48000 - 0.037) / 0.5);
      const hit = Math.round(truth(n) * 48000);
      return Math.abs(hit - frame) <= radius ? hit : frame;
    };
    const refined = refineWithTransients(e, 48000, snap);
    expect(refined.snapped).toBe(12);
    expect(refined.period).toBeCloseTo(0.5, 6);
    expect(Math.abs(refined.origin - 0.037)).toBeLessThan(0.0001);
  });

  it("leaves out an attack that is not on the beat, and keeps the taps' own line when too few attacks are found", () => {
    const taps = Array.from({ length: 12 }, (_, n) => 0.1 + 0.5 * n);
    const e = estimateTempo(taps)!;
    const wrong = (frame: number) => frame + 9000; // every "attack" is a hat well off the beat, all the same
    expect(refineWithTransients(e, 48000, wrong).period).toBeCloseTo(0.5, 6);
    const scattered = refineWithTransients(e, 48000, (frame) => frame + ((frame / 7) % 11) * 800);
    expect(scattered.snapped === 0 || scattered.snapped >= 4).toBe(true);
    expect(refineWithTransients(e, 48000, wrong).origin).toBeGreaterThan(0.09);
  });
});

describe("sections", () => {
  const total = 96000 * 20;
  const picked = (first: number, last: number, colorIndex = 0) => ({ first, last, colorIndex });

  it("never lets a section run past the limit, nor have no length", () => {
    expect(limitEnd(10, 50, 64)).toBe(50);
    expect(limitEnd(10, 200, 64)).toBe(74);
    expect(limitEnd(100, 5, 64)).toBe(36);
    expect(limitEnd(10, 10, 64)).toBe(10);
  });

  it("cuts from each section's first line to its last, exactly, with its colour", () => {
    const plans = planSections(total, grid, [picked(8, 16, 2), picked(0, 8, 1)]);
    expect(plans.map((p) => p.start)).toEqual([12000, 12000 + 8 * 24000]);
    expect(plans.map((p) => p.length)).toEqual([192000, 192000]);
    expect(plans.map((p) => p.bars)).toEqual([2, 2]);
    expect(plans.map((p) => p.colorIndex)).toEqual([1, 2]);
    expect(plans.map((p) => p.index)).toEqual([0, 1]);
    expect(plans.every((p) => p.audioFrames === p.length)).toBe(true);
  });

  it("keeps a section whole where the spacing is not a whole number of frames", () => {
    const g = gridFromTaps({ period: 23999.7 / 48000, origin: 100.4 / 48000 }, 48000, 4);
    const plans = planSections(total, g, [picked(0, 4), picked(4, 8)]);
    expect(plans[1].start).toBe(plans[0].start + plans[0].length);
  });

  it("follows a nudged line, and the sections either side of it share its frame", () => {
    const plans = planSections(total, nudgeLine(grid, 8, 500), [picked(0, 8), picked(8, 16)]);
    expect(plans[0].length).toBe(192500);
    expect(plans[1].start).toBe(plans[0].start + plans[0].length);
    expect(plans[1].length).toBe(191500);
  });

  it("cuts across a tempo change by the lines, and holds a section for the nearest whole bars", () => {
    const g = realignGrid(grid, { origin: lineFrame(grid, 8), beatFrames: 20000 });
    const plans = planSections(total, g, [picked(4, 14)]);
    expect(plans[0].start).toBe(lineFrame(grid, 4));
    expect(plans[0].length).toBe(Math.round(lineFrame(g, 14)) - Math.round(lineFrame(g, 4)));
    expect(plans[0].bars).toBe(3);
    expect(oddSections(g, [picked(4, 14), picked(0, 4)])).toEqual([2]);
    expect(oddSections(grid, [picked(0, 8)])).toEqual([]);
  });

  it("has nothing cut until sections are picked", () => {
    expect(planSections(total, grid, [])).toEqual([]);
    expect(inOrder([picked(9, 12), picked(1, 2)]).map((s) => s.first)).toEqual([1, 9]);
  });

  it("pads a section that starts before the song with silence, to its full length", () => {
    const plans = planSections(96000, { ...grid, segments: [{ line: 0, frame: -24000, beatFrames: 24000 }] }, [picked(0, 4)]);
    expect(plans[0].start).toBe(-24000);
    expect(plans[0].audioFrames).toBe(72000);
    const cut = sliceSection([new Float32Array(96000).fill(0.5)], plans[0])[0];
    expect(cut).toHaveLength(96000);
    expect(cut[0]).toBe(0);
    expect(cut[24000]).toBe(0.5);
  });

  it("scales to another sample rate, keeping sections end to end", () => {
    const plans = planSections(96000 * 10, grid, [picked(0, 4), picked(4, 8), picked(8, 12)]);
    const stem = scalePlans(plans, 48000, 44100);
    stem.slice(1).forEach((p, i) => expect(p.start).toBe(stem[i].start + stem[i].length));
    expect(stem[0].start).toBe(11025);
  });
});
