import { describe, expect, it } from "vitest";
import { gridStart, planSections, sectionSeconds, sliceSection, type SongGrid } from "./chop";

const grid = (over: Partial<SongGrid> = {}): SongGrid => ({ bpm: 120, beatsPerBar: 4, downbeatFrame: 0, sampleRate: 48000, ...over });

describe("planSections", () => {
  it("cuts whole 8-bar sections at the exact frame (120 BPM, 4/4, 48 kHz: 8 bars = 16 s = 768000 frames)", () => {
    const plan = planSections(768000 * 3, grid());
    expect(plan.map((s) => [s.start, s.length])).toEqual([
      [0, 768000],
      [768000, 768000],
      [1536000, 768000],
    ]);
  });

  it("answers the 75 BPM question: 17 sections of 8 bars last 435.2 s", () => {
    expect(sectionSeconds(75, 4) * 17).toBeCloseTo(435.2, 6);
    const rate = 44100;
    const total = Math.round(sectionSeconds(75, 4) * 17 * rate);
    const plan = planSections(total, grid({ bpm: 75, sampleRate: rate }));
    expect(plan).toHaveLength(17);
  });

  it("follows the project's beats per bar (3/4 and 7/4)", () => {
    expect(planSections(10_000_000, grid({ beatsPerBar: 3 }))[0].length).toBe(576000);
    expect(planSections(10_000_000, grid({ beatsPerBar: 7 }))[0].length).toBe(1344000);
  });

  it("rounds each cut from its exact position, so nothing drifts and the sections tile the song", () => {
    // 93.7 BPM does not give a whole number of frames per section.
    const g = grid({ bpm: 93.7, downbeatFrame: 1234.56 });
    const plan = planSections(48000 * 600, g);
    const exact = (8 * 4 * 60 * 48000) / 93.7;
    plan.forEach((s, k) => {
      expect(s.start).toBe(Math.round(1234.56 + k * exact));
      expect(Math.abs(s.length - exact)).toBeLessThan(1);
      if (k > 0) expect(s.start).toBe(plan[k - 1].start + plan[k - 1].length);
    });
  });

  it("pads a short last section to a full 8 bars", () => {
    const plan = planSections(768000 + 100000, grid());
    expect(plan).toHaveLength(2);
    expect(plan[1].length).toBe(768000);
    expect(plan[1].audioFrames).toBe(100000);
  });

  it("drops a last section that holds almost nothing", () => {
    expect(planSections(768000 + 1000, grid())).toHaveLength(1);
  });

  it("does not cut anything from before the downbeat, and pads when the downbeat is before the file starts", () => {
    const after = planSections(768000 * 2, grid({ downbeatFrame: 48000 }));
    expect(after[0].start).toBe(48000);
    const before = planSections(768000, grid({ downbeatFrame: -48000 }));
    expect(before[0].start).toBe(-48000);
    expect(before[0].audioFrames).toBe(768000 - 48000);
  });
});

describe("sliceSection", () => {
  it("returns exactly the planned length with the audio in the right place", () => {
    const data = [Float32Array.from({ length: 100 }, (_, i) => i + 1)];
    const out = sliceSection(data, { start: -10, length: 50, audioFrames: 40, index: 0 })[0];
    expect(out).toHaveLength(50);
    expect(out.slice(0, 10).every((v) => v === 0)).toBe(true);
    expect(out[10]).toBe(1);
    expect(out[49]).toBe(40);
    const tail = sliceSection(data, { start: 90, length: 30, audioFrames: 10, index: 0 })[0];
    expect(tail[9]).toBe(100);
    expect(tail[10]).toBe(0);
  });
});

describe("the cuts together", () => {
  it("rebuild the song exactly: joined end to end the sections are the song, with nothing lost, doubled or shifted", () => {
    // an awkward tempo and a fractional downbeat, so every cut is a rounding
    const g = grid({ bpm: 93.7, downbeatFrame: 1234.56, sampleRate: 44100 });
    const total = 44100 * 150;
    const data = [Float32Array.from({ length: total }, (_, i) => i)];
    const plans = planSections(total, g);
    const rebuilt: number[] = [];
    for (const plan of plans) {
      const out = sliceSection(data, plan)[0];
      expect(out).toHaveLength(plan.length);
      for (let i = 0; i < out.length; i++) rebuilt.push(out[i]);
    }
    const first = Math.round(1234.56);
    // frame by frame: the first value is the downbeat frame, each next is one more, until the audio runs out (then silence)
    for (let i = 0; i < rebuilt.length; i++) {
      const expected = first + i < total ? first + i : 0;
      if (rebuilt[i] !== expected) throw new Error(`frame ${i} is ${rebuilt[i]}, expected ${expected}`);
    }
    // and the last section ends on a whole-bar boundary of the exact grid
    const last = plans[plans.length - 1];
    const exactSection = (8 * 4 * 60 * 44100) / 93.7;
    expect(last.start + last.length).toBe(Math.round(1234.56 + plans.length * exactSection));
  });
});

describe("a cut moved by hand", () => {
  it("starts where it was put and still lasts exactly 8 bars; the others stay on the grid", () => {
    const g = grid({ shifts: { 1: 4410, 2: -300 } });
    const plan = planSections(768000 * 4, g);
    expect(plan.map((s) => s.start)).toEqual([0, 768000 + 4410, 1536000 - 300, 2304000]);
    expect(plan.every((s) => s.length === 768000)).toBe(true);
    expect(plan.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("moves with the grid: shifts are measured from where the grid puts the cut", () => {
    const g = grid({ bpm: 93.7, shifts: { 2: 100 } });
    expect(planSections(48000 * 300, g)[2].start).toBe(gridStart(g, 2) + 100);
  });

  it("does not change anything when there are no shifts", () => {
    expect(planSections(768000 * 3, grid({ shifts: {} }))).toEqual(planSections(768000 * 3, grid()));
  });
});
