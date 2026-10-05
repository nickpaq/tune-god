import { describe, expect, it } from "vitest";
import { cutFrame, effectiveBpm, framesPerBarOf, planSections, scaleGrid, sectionSeconds, settleCut, sliceSection, withoutAnchor, type SongGrid } from "./chop";

const grid = (over: Partial<SongGrid> = {}): SongGrid => ({ bpm: 120, beatsPerBar: 4, downbeatFrame: 0, sampleRate: 48000, ...over });
// 120 BPM, 4/4, 48 kHz: one bar is 96000 frames, 8 bars 768000
const BAR = 96000;
const SECTION = 768000;

describe("planSections", () => {
  it("cuts whole 8-bar sections at the exact frame (120 BPM, 4/4, 48 kHz: 8 bars = 16 s)", () => {
    const plan = planSections(SECTION * 3, grid());
    expect(plan.map((s) => [s.start, s.length, s.bars])).toEqual([
      [0, SECTION, 8],
      [SECTION, SECTION, 8],
      [SECTION * 2, SECTION, 8],
    ]);
  });

  it("answers the 75 BPM question: 17 sections of 8 bars last 435.2 s", () => {
    expect(sectionSeconds(75, 4) * 17).toBeCloseTo(435.2, 6);
    const rate = 44100;
    const total = Math.round(sectionSeconds(75, 4) * 17 * rate);
    expect(planSections(total, grid({ bpm: 75, sampleRate: rate }))).toHaveLength(17);
  });

  it("follows the project's beats per bar (3/4 and 7/4)", () => {
    expect(planSections(10_000_000, grid({ beatsPerBar: 3 }))[0].length).toBe(576000);
    expect(planSections(10_000_000, grid({ beatsPerBar: 7 }))[0].length).toBe(1344000);
  });

  it("rounds each cut from its exact position, so nothing drifts and the sections tile the song", () => {
    const g = grid({ bpm: 93.7, downbeatFrame: 1234.56 });
    const plan = planSections(48000 * 600, g);
    const exact = (8 * 4 * 60 * 48000) / 93.7;
    plan.forEach((s, k) => {
      expect(s.start).toBe(Math.round(1234.56 + k * exact));
      expect(Math.abs(s.length - exact)).toBeLessThan(1);
      if (k > 0) expect(s.start).toBe(plan[k - 1].start + plan[k - 1].length);
    });
  });

  it("pads a short last section to a full 8 bars, and drops one that holds almost nothing", () => {
    const plan = planSections(SECTION + 100000, grid());
    expect(plan).toHaveLength(2);
    expect(plan[1].length).toBe(SECTION);
    expect(plan[1].audioFrames).toBe(100000);
    expect(planSections(SECTION + 1000, grid())).toHaveLength(1);
  });

  it("does not cut anything from before the downbeat, and pads when the downbeat is before the file starts", () => {
    expect(planSections(SECTION * 2, grid({ downbeatFrame: 48000 }))[0].start).toBe(48000);
    const before = planSections(SECTION, grid({ downbeatFrame: -48000 }));
    expect(before[0].start).toBe(-48000);
    expect(before[0].audioFrames).toBe(SECTION - 48000);
  });
});

describe("sliceSection", () => {
  it("returns exactly the planned length with the audio in the right place", () => {
    const data = [Float32Array.from({ length: 100 }, (_, i) => i + 1)];
    const out = sliceSection(data, { start: -10, length: 50, audioFrames: 40, index: 0, bars: 8 })[0];
    expect(out).toHaveLength(50);
    expect(out.slice(0, 10).every((v) => v === 0)).toBe(true);
    expect(out[10]).toBe(1);
    expect(out[49]).toBe(40);
    const tail = sliceSection(data, { start: 90, length: 30, audioFrames: 10, index: 0, bars: 8 })[0];
    expect(tail[9]).toBe(100);
    expect(tail[10]).toBe(0);
  });

  it("the sections together rebuild the song exactly, with nothing lost, doubled or shifted", () => {
    const g = grid({ bpm: 93.7, downbeatFrame: 1234.56, sampleRate: 44100 });
    const total = 44100 * 150;
    const data = [Float32Array.from({ length: total }, (_, i) => i)];
    const rebuilt: number[] = [];
    for (const plan of planSections(total, g)) for (const v of sliceSection(data, plan)[0]) rebuilt.push(v);
    const first = Math.round(1234.56);
    for (let i = 0; i < rebuilt.length; i++) {
      const expected = first + i < total ? first + i : 0;
      if (rebuilt[i] !== expected) throw new Error(`frame ${i} is ${rebuilt[i]}, expected ${expected}`);
    }
  });
});

describe("a song with a short section", () => {
  it("a section of 7 bars is 7 bars long and every later section starts a bar sooner", () => {
    const plan = planSections(SECTION * 5, grid({ bars: { 2: 7 } }));
    expect(plan.slice(0, 5).map((s) => [s.start, s.length, s.bars])).toEqual([
      [0, SECTION, 8],
      [SECTION, SECTION, 8],
      [SECTION * 2, 7 * BAR, 7],
      [SECTION * 2 + 7 * BAR, SECTION, 8],
      [SECTION * 3 + 7 * BAR, SECTION, 8],
    ]);
  });

  it("still tiles the song: each section starts where the one before ends", () => {
    const plan = planSections(48000 * 400, grid({ bpm: 93.7, bars: { 1: 3, 4: 5 } }));
    for (let i = 1; i < plan.length; i++) expect(plan[i].start).toBe(plan[i - 1].start + plan[i - 1].length);
    expect(plan[1].bars).toBe(3);
  });
});

describe("the grid is refined by every cut placed by hand", () => {
  it("with only bar 1, the tempo is the base tempo", () => {
    expect(framesPerBarOf(grid())).toBe(BAR);
    expect(effectiveBpm(grid())).toBeCloseTo(120, 9);
  });

  it("a cut placed by hand starts where it was put", () => {
    const plan = planSections(SECTION * 5, grid({ anchors: { 2: 2 * SECTION + 4410 } }));
    expect(plan[2].start).toBe(2 * SECTION + 4410);
  });

  it("the cuts between two placed cuts are spread evenly between them", () => {
    const g = grid({ anchors: { 4: 4 * SECTION + 9600 } });
    const frames = [1, 2, 3].map((k) => cutFrame(g, k));
    expect(frames[0]).toBeCloseTo(SECTION + 2400, 6);
    expect(frames[1]).toBeCloseTo(2 * SECTION + 4800, 6);
    expect(frames[2]).toBeCloseTo(3 * SECTION + 7200, 6);
  });

  it("the cuts after the last one placed follow the tempo that the cuts placed say, from that cut on", () => {
    // cut 4 placed 1% late: the song runs 1% slower than the grid thought
    const late = 4 * SECTION * 1.01;
    const g = grid({ anchors: { 4: late } });
    expect(effectiveBpm(g)).toBeCloseTo(120 / 1.01, 6);
    expect(cutFrame(g, 5)).toBeCloseTo(late + SECTION * 1.01, 3);
    expect(cutFrame(g, 6)).toBeCloseTo(late + 2 * SECTION * 1.01, 3);
  });

  it("more cuts make a better fit: the tempo is the line through all of them, so one cut put a little off counts for less", () => {
    const S = SECTION * 1.002; // the true section length, 0.2% long
    const noise = [0, 3000, -2000, 2500, -3000];
    const anchors: Record<number, number> = {};
    for (let k = 1; k <= 4; k++) anchors[k] = k * S + noise[k];
    const g = grid({ anchors });
    const fitted = framesPerBarOf(g) * 8;
    // the fit is closer to the truth than the one-cut estimate from the last cut alone
    const lastOnly = anchors[4] / 4;
    expect(Math.abs(fitted - S)).toBeLessThan(Math.abs(lastOnly - S));
    // and the cuts after the last follow from it
    expect(cutFrame(g, 5)).toBeCloseTo(anchors[4] + fitted, 3);
  });

  it("changes nothing about cuts to the left of a cut placed further on, except to spread them", () => {
    const base = cutFrame(grid(), 0);
    expect(cutFrame(grid({ anchors: { 3: 3 * SECTION + 900 } }), 0)).toBe(base);
  });

  it("keeps the exact tiling when the cuts placed lie on the grid", () => {
    const g = grid({ anchors: { 2: 2 * SECTION, 5: 5 * SECTION } });
    const a = planSections(SECTION * 6, g);
    const b = planSections(SECTION * 6, grid());
    expect(a).toEqual(b);
  });
});

describe("settleCut", () => {
  it("makes the cut an anchor where it was put", () => {
    const edit = settleCut(grid(), 3, 3 * SECTION + 2400);
    expect(edit.anchors[3]).toBe(3 * SECTION + 2400);
    expect(edit.bars).toEqual({});
    expect(edit.barChange).toBe(0);
  });

  it("one bar early means the section before it is 7 bars, and the cuts after it follow", () => {
    const edit = settleCut(grid(), 3, 3 * SECTION - BAR + 240); // 5 ms late
    expect(edit.barChange).toBe(-1);
    expect(edit.bars).toEqual({ 2: 7 });
    const plan = planSections(SECTION * 6, { ...grid(), ...edit });
    expect(plan[3].start).toBe(3 * SECTION - BAR + 240);
    expect(plan[2].bars).toBe(7);
    // the cut after it is 8 bars on from the cut that was put, at the tempo those two cuts say (5 ms late over 23 bars: a hair slower than 120)
    const g = { ...grid(), ...edit };
    expect(Math.abs(plan[4].start - (plan[3].start + 8 * framesPerBarOf(g)))).toBeLessThan(1);
    expect(effectiveBpm(g)).toBeLessThan(120);
  });

  it("two or three bars early make a 6 or 5 bar section; a bar late makes a 9 bar section", () => {
    expect(settleCut(grid(), 3, 3 * SECTION - 2 * BAR).bars).toEqual({ 2: 6 });
    expect(settleCut(grid(), 3, 3 * SECTION - 3 * BAR + 100).bars).toEqual({ 2: 5 });
    expect(settleCut(grid(), 3, 3 * SECTION + BAR).bars).toEqual({ 2: 9 });
  });

  it("anything that is not nearly a whole bar is a plain move (a drifting song)", () => {
    for (const bars of [0.3, 0.5, 0.15, -0.4]) {
      const edit = settleCut(grid(), 3, Math.round(3 * SECTION + bars * BAR));
      expect(edit.barChange).toBe(0);
      expect(edit.bars).toEqual({});
    }
    expect(settleCut(grid(), 3, 3 * SECTION + 2400).barChange).toBe(0);
  });

  it("is judged against where the other cuts put it, not against the cut's own old place", () => {
    // cut 3 already placed 1 bar early (structure change made); dragging it back to where the grid had it restores 8 bars
    const first = settleCut(grid(), 3, 3 * SECTION - BAR);
    const moved = { ...grid(), ...first };
    const back = settleCut(moved, 3, 3 * SECTION);
    expect(back.barChange).toBe(1);
    expect(back.bars).toEqual({});
  });

  it("keeps the bars of other sections, and will not make a section shorter than a bar or longer than 16", () => {
    const g = grid({ bars: { 0: 6 } });
    expect(settleCut(g, 3, cutFrame(g, 3) - BAR).bars).toEqual({ 0: 6, 2: 7 });
    const short = grid({ bars: { 2: 1 } });
    expect(settleCut(short, 3, cutFrame(short, 3) - BAR).barChange).toBe(0);
    const long = grid({ bars: { 2: 16 } });
    expect(settleCut(long, 3, cutFrame(long, 3) + BAR).barChange).toBe(0);
  });

  it("never treats the first cut as a structure change", () => {
    expect(settleCut(grid(), 0, BAR).barChange).toBe(0);
  });
});

describe("snapping a cut to the grid", () => {
  it("takes its anchor away: it goes back to where the other cuts say", () => {
    const g = grid({ anchors: { 2: 2 * SECTION + 4410, 4: 4 * SECTION + 8820 } });
    const snapped = withoutAnchor(g, 2);
    // between bar 1 and cut 5 (placed 8820 late at section 4): spread evenly
    expect(cutFrame(snapped, 2)).toBeCloseTo(2 * SECTION + 4410, 6);
    expect(snapped.anchors).toEqual({ 4: 4 * SECTION + 8820 });
  });

  it("with no other cut placed, a snapped cut is exactly on the base grid", () => {
    const g = withoutAnchor(grid({ anchors: { 3: 3 * SECTION + 777 } }), 3);
    expect(cutFrame(g, 3)).toBe(3 * SECTION);
  });
});

describe("scaleGrid", () => {
  it("puts the same cuts at the same moments on audio at another sample rate", () => {
    const g = grid({ downbeatFrame: 48000, anchors: { 2: 2 * SECTION + 4800 } });
    const scaled = scaleGrid(g, 44100);
    expect(scaled.downbeatFrame).toBeCloseTo(44100, 6);
    expect(cutFrame(scaled, 2) / 44100).toBeCloseTo(cutFrame(g, 2) / 48000, 9);
    expect(cutFrame(scaled, 5) / 44100).toBeCloseTo(cutFrame(g, 5) / 48000, 9);
    expect(effectiveBpm(scaled)).toBeCloseTo(effectiveBpm(g), 9);
  });
});
