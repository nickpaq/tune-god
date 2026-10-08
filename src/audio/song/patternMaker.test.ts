import { describe, expect, it } from "vitest";
import { chopEighths, dragLength, needsGate, orderChops, patternBars, positionText, renderSequence, setSlot, slotNotes, slotStarts, type MakerChop, type Slot } from "./patternMaker";

const chop = (barIndex: number, bars = 1, slice = barIndex + 1): MakerChop => ({ slice, start: barIndex * 1000, length: bars * 1000, bars, barIndex, colorIndex: barIndex, color: "#fff" });
// chops that started on bars 1 to 8 of the song (barIndex 0 to 7)
const chops = Array.from({ length: 8 }, (_, i) => chop(i));

describe("orderChops", () => {
  it("at the start of the song lists bar 1 first (the bottom), then bar 3, then 2, then 4, in song order within each", () => {
    expect(orderChops(chops, 0, 4)).toEqual([0, 4, 2, 6, 1, 5, 3, 7]);
  });

  it("halfway through bar three lists the chops of bar three, then bar one, then bar four and bar two", () => {
    // 8 eighths a bar in 4/4; halfway through bar 3 is eighth 2 * 8 + 4
    expect(orderChops(chops, 20, 4)).toEqual([2, 6, 0, 4, 3, 7, 1, 5]);
  });

  it("lists every chop once", () => {
    expect([...orderChops(chops, 13, 4)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("dragLength", () => {
  it("takes lengths from one eighth to the whole chop", () => {
    expect(dragLength(5, 16)).toEqual({ eighths: 5, trim: 0 });
    expect(dragLength(1, 16)).toEqual({ eighths: 1, trim: 0 });
    expect(dragLength(99, 16)).toEqual({ eighths: 16, trim: 0 });
  });

  it("goes to nothing and then cuts the slot before short", () => {
    expect(dragLength(0, 16)).toEqual({ eighths: 0, trim: 1 });
    expect(dragLength(-3, 16)).toEqual({ eighths: 0, trim: 4 });
  });
});

describe("slots", () => {
  const slots: Slot[] = [
    { kind: "chop", chop: 2, eighths: 8 },
    { kind: "silence", eighths: 4 },
    { kind: "chop", chop: 0, eighths: 3 },
  ];

  it("lays the slots end to end", () => {
    expect(slotStarts(slots)).toEqual({ starts: [0, 8, 12], total: 15 });
  });

  it("makes a note per chop slot, at its place, and none for silence", () => {
    expect(slotNotes(slots, chops)).toEqual([
      { slice: 3, start: 0, eighths: 8 },
      { slice: 1, start: 12, eighths: 3 },
    ]);
  });

  it("rounds the pattern up to whole bars", () => {
    expect(patternBars(slots, 4)).toBe(2);
    expect(patternBars([], 4)).toBe(1);
  });

  it("cuts the slot before by the trim, never under one eighth, and can add or replace a slot", () => {
    expect(setSlot(slots, 3, { kind: "silence", eighths: 8 }, 2)[2]).toEqual({ kind: "chop", chop: 0, eighths: 1 });
    expect(setSlot(slots, 1, { kind: "silence", eighths: 6 })[1]).toEqual({ kind: "silence", eighths: 6 });
    expect(setSlot(slots, 3, { kind: "silence", eighths: 8 })).toHaveLength(4);
  });

  it("needs the note length to decide only when a slot is cut short or silence is used", () => {
    expect(needsGate([{ kind: "chop", chop: 0, eighths: chopEighths(chops[0], 4) }], chops, 4)).toBe(false);
    expect(needsGate([{ kind: "chop", chop: 0, eighths: 3 }], chops, 4)).toBe(true);
    expect(needsGate([{ kind: "silence", eighths: 8 }], chops, 4)).toBe(true);
  });
});

describe("positionText", () => {
  it("counts bars and beats from 1.1", () => {
    expect(positionText(0, 4)).toBe("1.1");
    expect(positionText(9, 4)).toBe("2.1+");
    expect(positionText(20, 4)).toBe("3.3");
  });
});

describe("renderSequence", () => {
  it("puts each chop at its place for the eighths it plays and leaves silence empty", () => {
    const data = [Float32Array.from({ length: 4000 }, (_, i) => i + 1)];
    const ch = [chop(0), chop(1)]; // 1000 frames each, bars of 4 beats
    const out = renderSequence(data, ch, [{ kind: "chop", chop: 1, eighths: 2 }, { kind: "silence", eighths: 2 }, { kind: "chop", chop: 0, eighths: 100 }], 100); // 50 frames an eighth
    // 2 eighths of chop 1 = 100 frames from 1000, then 100 of silence, then chop 0 for 100 eighths, which is cut to the chop's 1000 frames
    expect(out[0]).toHaveLength(104 * 50);
    expect(out[0][0]).toBe(1001);
    expect(out[0][99]).toBe(1100);
    expect(out[0][100]).toBe(0);
    expect(out[0][199]).toBe(0);
    expect(out[0][200]).toBe(1);
  });
});
