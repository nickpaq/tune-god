import { describe, expect, it } from "vitest";
import { estimateLoopBars, FIRST_LOOP_PATTERN_SLOT, writeLoopPatterns } from "./loopPatterns";
import { emptySequence, isEmpty, isFreeForChop, SEQUENCE_SLOTS, TICKS_PER_BEAT } from "./exportSong";

const slots = () => Array.from({ length: SEQUENCE_SLOTS }, () => emptySequence());
const bar = (bpm: number, bars: number, beatsPerBar = 4) => (bars * beatsPerBar * 60) / bpm;

describe("estimateLoopBars", () => {
  it("rounds a loop's length to 2, 4, 8 or 16 bars at the tempo in its name", () => {
    expect(estimateLoopBars(bar(140, 4), 140)).toBe(4);
    expect(estimateLoopBars(bar(90, 8), 90)).toBe(8);
    expect(estimateLoopBars(bar(120, 16), 120)).toBe(16);
    expect(estimateLoopBars(bar(120, 2), 120)).toBe(2);
  });
  it("takes the nearest, never fewer than 2 or more than 16", () => {
    expect(estimateLoopBars(bar(120, 1), 120)).toBe(2);
    expect(estimateLoopBars(bar(120, 32), 120)).toBe(16);
    expect(estimateLoopBars(bar(120, 3.1), 120)).toBe(4);
    expect(estimateLoopBars(bar(120, 6), 120)).toBe(8);
    expect(estimateLoopBars(bar(120, 11), 120)).toBe(8);
    expect(estimateLoopBars(bar(120, 12), 120)).toBe(16);
  });
  it("counts the bars of the project's time signature", () => {
    expect(estimateLoopBars(bar(100, 4, 3), 100, 3)).toBe(4);
  });
  it("gives nothing for an unusable length or tempo", () => {
    for (const [seconds, bpm] of [[0, 120], [4, 0], [NaN, 120], [4, Infinity], [-1, 120]]) expect(estimateLoopBars(seconds, bpm)).toBeNull();
  });
});

describe("writeLoopPatterns", () => {
  it("writes a pattern per loop from the last slot back towards the middle, one held note at 1.1.1 with velocity 100", () => {
    const sequences = slots();
    expect(writeLoopPatterns(sequences, [{ pad: 16, bars: 4 }, { pad: 17, bars: 8 }, { pad: 20, bars: 2 }], 4)).toBe(3);
    const filled = sequences.map((s, i) => (isEmpty(s) ? -1 : i)).filter((i) => i >= 0);
    expect(filled).toEqual([29, 30, 31]);
    const first = sequences[31].noteSequence.pattern;
    expect(first.numBars).toBe(4);
    expect(first.notes).toHaveLength(1);
    expect(first.notes[0]).toMatchObject({ num: 16, start: 0, timeOffset: 0, pitch: 0, vel: 100, length: 4 * 4 * TICKS_PER_BEAT });
    expect(sequences[30].noteSequence.pattern.numBars).toBe(8);
    expect(sequences[30].noteSequence.pattern.notes[0].length).toBe(8 * 4 * TICKS_PER_BEAT);
    expect(sequences[29].noteSequence.pattern.numBars).toBe(2);
  });

  it("never touches the first two banks of 8, even with more loops than slots", () => {
    const sequences = slots();
    const entries = Array.from({ length: 24 }, (_, i) => ({ pad: i, bars: 4 }));
    expect(writeLoopPatterns(sequences, entries, 4)).toBe(32 - FIRST_LOOP_PATTERN_SLOT);
    for (let i = 0; i < FIRST_LOOP_PATTERN_SLOT; i++) expect(isEmpty(sequences[i]), `slot ${i}`).toBe(true);
    for (let i = FIRST_LOOP_PATTERN_SLOT; i < 32; i++) expect(isEmpty(sequences[i]), `slot ${i}`).toBe(false);
  });

  it("skips slots that already hold a pattern and does not overwrite them", () => {
    const sequences = slots();
    const mine = { ...emptySequence(), noteSequence: { pattern: { numBars: 1, notes: [{ num: 3 }] } } };
    sequences[31] = mine;
    sequences[29] = mine;
    writeLoopPatterns(sequences, [{ pad: 1, bars: 4 }, { pad: 2, bars: 4 }], 4);
    expect(sequences[31]).toBe(mine);
    expect(sequences[29]).toBe(mine);
    expect(sequences[30].noteSequence.pattern.notes[0].num).toBe(1);
    expect(sequences[28].noteSequence.pattern.notes[0].num).toBe(2);
  });

  it("clears its own patterns from an earlier export first, so none go stale", () => {
    const sequences = slots();
    writeLoopPatterns(sequences, [{ pad: 1, bars: 4 }, { pad: 2, bars: 4 }, { pad: 3, bars: 4 }], 4);
    expect(writeLoopPatterns(sequences, [{ pad: 9, bars: 2 }], 4)).toBe(1);
    expect(sequences.filter((s) => !isEmpty(s))).toHaveLength(1);
    expect(sequences[31].noteSequence.pattern.notes[0].num).toBe(9);
  });

  it("lets a chop take a loop pattern's slot (chops always win), but not a pattern of the user's", () => {
    const sequences = slots();
    writeLoopPatterns(sequences, [{ pad: 1, bars: 4 }], 4);
    expect(isFreeForChop(sequences[31])).toBe(true);
    expect(isFreeForChop(emptySequence())).toBe(true);
    expect(isFreeForChop({ ...emptySequence(), noteSequence: { pattern: { numBars: 1, notes: [{ num: 3 }] } } })).toBe(false);
  });
});
