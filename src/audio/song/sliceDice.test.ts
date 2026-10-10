import { describe, expect, it } from "vitest";
import { baseGrid } from "./chopMarks";
import { slotStarts, type Slot } from "./patternMaker";
import {
  compact,
  copyOver,
  firstStep,
  makePiece,
  nearestBar,
  neighbourPiece,
  nextSequential,
  randomize,
  rangeSlots,
  repeatSlot,
  silenceAfter,
  sizeSteps,
  SIZES,
  sourceStepOf,
  sourceSteps,
  withPiece,
  type DiceState,
} from "./sliceDice";

const rate = 44100;
const grid = baseGrid(rate, 4, 120, 0);
const frames = rate * 40; // 40 s = 80 beats = 20 bars at 120 BPM
const colors = ["#a", "#b", "#c", "#d"];
const empty: DiceState = { chops: [], slots: [] };
const piece = (step: number, steps: number) => makePiece(grid, frames, colors, step, steps)!;
const arrangement = (...pieces: [number, number][]): DiceState => pieces.reduce((s, [a, n]) => withPiece(s, piece(a, n)), empty);
const total = (s: DiceState) => slotStarts(s.slots).total;
const sources = (s: DiceState) => s.slots.map((x) => sourceStepOf(grid, s, x));

describe("slice and dice sizes", () => {
  it("offers the seven sizes in the order asked for", () => {
    expect(SIZES.map((s) => s.label)).toEqual(["1/8", "1/8T", "1/4", "1/4T", "1/2", "1/2T", "1 bar"]);
    expect(SIZES.map((_, i) => sizeSteps(i, 4))).toEqual([2, 4 / 3, 4, 8 / 3, 8, 16 / 3, 16].map((n) => Math.round(n * 12) / 12));
  });
  it("makes a bar the bar of the time signature", () => {
    expect(sizeSteps(6, 3)).toBe(12);
  });
});

describe("pieces of the song", () => {
  it("lands a quarter note on the grid frames", () => {
    expect(piece(0, 4).start).toBe(0);
    expect(piece(0, 4).length).toBe(22050);
    expect(piece(4, 4).start).toBe(22050);
  });
  it("refuses a piece that runs past the song or starts before it", () => {
    expect(makePiece(grid, frames, colors, 80 * 4 - 2, 4)).toBeNull();
    expect(makePiece(grid, frames, colors, -4, 4)).toBeNull();
  });
  it("starts the song at its first step on the grid", () => {
    expect(firstStep(grid)).toBe(0);
    expect(firstStep(baseGrid(rate, 4, 120, 0.3))).toBeLessThanOrEqual(0);
  });
  it("counts the pieces a song holds", () => {
    expect(sourceSteps(grid, frames, colors, 0, 4)).toHaveLength(80);
    expect(sourceSteps(grid, frames, colors, 0, 16)).toHaveLength(20);
  });
});

describe("the arrangement", () => {
  it("steps a slot to the next and previous piece of the song at its own length", () => {
    const s = arrangement([8, 4]);
    expect(sourceStepOf(grid, s, s.slots[0])).toBe(8);
    expect(neighbourPiece(grid, frames, colors, s, s.slots[0], 1)!.start).toBe(piece(12, 4).start);
    expect(neighbourPiece(grid, frames, colors, s, s.slots[0], -1)!.start).toBe(piece(4, 4).start);
  });
  it("stops at the ends of the song", () => {
    const first = arrangement([0, 4]);
    expect(neighbourPiece(grid, frames, colors, first, first.slots[0], -1)).toBeNull();
    const last = arrangement([80 * 4 - 4, 4]);
    expect(neighbourPiece(grid, frames, colors, last, last.slots[0], 1)).toBeNull();
  });
  it("pastes the next sequential piece after the nearest chop", () => {
    const s = arrangement([0, 4], [40, 4]);
    expect(nextSequential(grid, frames, colors, s, 1, 4, 0)!.start).toBe(piece(44, 4).start);
    expect(nextSequential(grid, frames, colors, s, 0, 4, 0)!.start).toBe(piece(4, 4).start);
    expect(nextSequential(grid, frames, colors, empty, -1, 4, 0)!.start).toBe(0);
  });
  it("skips silence to find the chop the next piece follows", () => {
    const s = silenceAfter(arrangement([8, 4]), 0, 4);
    expect(nextSequential(grid, frames, colors, s, 1, 4, 0)!.start).toBe(piece(12, 4).start);
  });
  it("inserts a repeat and a silence after a slot without touching the rest", () => {
    const s = arrangement([0, 4], [4, 4]);
    const r = repeatSlot(s, 0);
    expect(r.slots.map((x) => (x.kind === "chop" ? x.chop : -1))).toEqual([0, 0, 1]);
    expect(silenceAfter(s, 0, 4).slots.map((x) => x.kind)).toEqual(["chop", "silence", "chop"]);
    expect(total(r)).toBe(12);
  });
});

describe("randomize", () => {
  it("keeps every slot's length and place in the bar, and silence", () => {
    let s = arrangement([0, 4], [4, 4], [8, 4], [12, 4]);
    s = silenceAfter(s, 1, 4);
    const r = randomize(grid, frames, colors, s, 0, () => 0.5);
    expect(r.slots.map((x) => x.steps)).toEqual(s.slots.map((x) => x.steps));
    expect(r.slots[2].kind).toBe("silence");
    const starts = slotStarts(r.slots).starts;
    r.slots.forEach((slot, i) => {
      if (slot.kind === "silence") return;
      expect((((sourceStepOf(grid, r, slot)! - starts[i]) % 16) + 16) % 16).toBeCloseTo(0, 6);
    });
  });
});

describe("copying a stretch of the arrangement", () => {
  const two = () => arrangement([0, 4], [4, 4], [8, 4], [12, 4], [100, 4], [104, 4], [108, 4], [112, 4]);
  it("copies a bar over the next bar and overwrites what was there", () => {
    const s = two();
    const c = copyOver(grid, frames, colors, s, 0, 16, 16);
    expect(total(c)).toBe(total(s));
    expect(sources(c).slice(0, 8)).toEqual([0, 4, 8, 12, 0, 4, 8, 12]);
  });
  it("repeats a short stretch over a long one", () => {
    const c = copyOver(grid, frames, colors, two(), 0, 8, 24);
    expect(sources(c).slice(0, 8)).toEqual([0, 4, 0, 4, 0, 4, 0, 4]);
    expect(total(c)).toBe(32);
  });
  it("cuts the last copy to fit", () => {
    const c = copyOver(grid, frames, colors, arrangement([0, 8], [8, 8]), 0, 16, 4);
    expect(c.slots.map((x) => x.steps)).toEqual([8, 8, 4]);
    expect(total(c)).toBe(20);
  });
  it("keeps the part after the overwritten stretch", () => {
    const c = copyOver(grid, frames, colors, arrangement([0, 16], [16, 16], [32, 16]), 0, 16, 16);
    expect(sources(c)).toEqual([0, 0, 32]);
  });
  it("cuts a slot that crosses the edge of the copied stretch", () => {
    const part = rangeSlots(grid, frames, colors, arrangement([0, 8], [8, 8], [16, 8]), 4, 12);
    expect(part.slots.map((x) => x.steps)).toEqual([4, 4]);
    expect(sources(part)).toEqual([4, 8]);
  });
  it("snaps a position to the nearest bar", () => {
    expect(nearestBar(7, 4)).toBe(0);
    expect(nearestBar(9, 4)).toBe(16);
  });
  it("copies silence too", () => {
    const base = arrangement([0, 16]);
    const s: DiceState = { chops: base.chops, slots: [{ kind: "silence", steps: 16 } as Slot, ...base.slots] };
    expect(copyOver(grid, frames, colors, s, 0, 16, 16).slots[1].kind).toBe("silence");
  });
});

describe("compacting", () => {
  it("drops pieces no slot plays and renumbers the rest", () => {
    let s = arrangement([0, 4], [4, 4]);
    s = withPiece(s, piece(8, 4), 1, "replace");
    expect(s.chops).toHaveLength(3);
    const c = compact(s);
    expect(c.chops.map((x) => x.start)).toEqual([piece(0, 4).start, piece(8, 4).start]);
    expect(c.slots.map((x) => (x.kind === "chop" ? x.chop : -1))).toEqual([0, 1]);
  });
});
