import { describe, expect, it } from "vitest";
import { emptySession, eventsBetween, readSession, writeSession, quantizedTick, TICKS_PER_BEAT, compileArrangement, writeArrangement, replaceLanePattern, cropPattern, longestSectionPattern, trackPatterns, setTrackPattern, toggleScenePattern } from "./model";
describe("Koala bank-track sequencing", () => {
  it("uses 32 patterns and bank-filtered independent selections", () => {
    const s = emptySession(); s.selected = [0, 1, 2, 3];
    s.patterns[0].notes = [{ pad: 0, tick: 0, length: 1024, pitch: 0, velocity: 100 }, { pad: 16, tick: 0, length: 1024, pitch: 0, velocity: 100 }];
    s.patterns[1].notes = [{ pad: 17, tick: 1024, length: 1024, pitch: 7, velocity: 90 }];
    expect(s.patterns).toHaveLength(32);
    expect(eventsBetween(s, 4, 0, 4096).map(n => n.pad)).toEqual([0, 17]);
    s.muted[1] = true; expect(eventsBetween(s, 4, 0, 4096).map(n => n.pad)).toEqual([0]);
  });
  it("loops without duplicate notes at adjacent scheduling boundaries", () => {
    const s = emptySession(); s.patterns[0].notes = [{ pad: 0, tick: 0, length: 1024, pitch: 0, velocity: 100 }];
    expect(eventsBetween(s, 4, 0, 16384)).toHaveLength(1);
    expect(eventsBetween(s, 4, 16384, 32768)[0].absoluteTick).toBe(16384);
  });
  it("round-trips pad base, pitch, velocity and time through Koala's format", () => {
    const original = { sequences: [{ noteSequence: { pattern: { numBars: 2, notes: [{ num: 18, timeOffset: 1234, length: 444, pitch: 4, vel: 77, chance: 0.75, pan: 0.2, subPad: 3 }] } }, parameterSequences: [{ kept: true }] }] };
    const session = readSession(original, 1); const saved = writeSession(original, session, 1);
    expect(saved.sequences[0].noteSequence.pattern.notes[0]).toMatchObject({ num: 18, timeOffset: 1234, length: 444, pitch: 4, vel: 77, chance: 0.75, pan: 0.2, subPad: 3 });
    expect(saved.sequences[0].parameterSequences).toEqual([{ kept: true }]);
  });
  it("quantizes recording against the loop, including the last step wrapping to zero", () => {
    expect(quantizedTick(16370, 16, 16384)).toBe(0);
    expect(quantizedTick(1100, 16, 16384)).toBe(1024);
    expect(quantizedTick(1100, 0, 16384)).toBe(1100);
    expect(TICKS_PER_BEAT).toBe(4096);
  });
});

describe("single master arrangement", () => {
  const note = (pad: number) => ({ pad, tick: 0, length: 1024, pitch: 7, velocity: 77 });
  const pattern = { bars: 1, notes: [note(0), note(1)] };
  const arrangement = () => ({ lanes: [{ id: "A", bank: 0, muted: true }, { id: "piano", pianoPad: 1, muted: false }], sections: [{ bars: 2, patterns: { A: pattern, piano: pattern } }, { bars: 1, patterns: { A: pattern, piano: null } }] });
  it("keeps independent piano audible with its source bank muted and omits empty sections", () => {
    const result = compileArrangement(arrangement(), 4);
    expect(result.bars).toBe(3);
    expect(result.notes.map(n => [n.pad, n.tick])).toEqual([[1, 0], [1, 16384]]);
  });
  it("does not double-trigger piano notes through their former bank", () => {
    const a = arrangement(); a.lanes[0].muted = false;
    expect(compileArrangement(a, 4).notes.filter(n => n.pad === 1)).toHaveLength(2);
  });
  it("pattern replacement affects only the chosen lane and section", () => {
    const a = arrangement(); const changed = replaceLanePattern(a, 0, "piano", null);
    expect(compileArrangement(changed, 4).notes).toEqual([]);
    expect(a.sections[0].patterns.piano).toEqual(pattern);
    expect(changed.sections[1]).toBe(a.sections[1]);
  });
  it("writes one long native pattern while preserving other imported patterns", () => {
    const original = { autoPlay: "next", sequences: [{ noteSequence: { pattern: { notes: [], numBars: 1 } } }, { custom: true, noteSequence: { pattern: { notes: [{ num: 99, chance: 0.3 }], numBars: 8 } } }] };
    const saved = writeArrangement(original, arrangement(), 4, 0);
    expect(saved.sequences[0].noteSequence.pattern.numBars).toBe(3);
    expect(saved.sequences[0].noteSequence.pattern.notes).toHaveLength(2);
    expect(saved.sequences[1]).toEqual(original.sequences[1]);
    expect(original.sequences[0].noteSequence.pattern.numBars).toBe(1);
  });
});

describe("pattern cropping and section duration", () => {
  const beat = TICKS_PER_BEAT;
  const pattern = { bars: 8, notes: Array.from({ length: 8 }, (_, bar) => ({ pad: 0, tick: bar * 4 * beat, length: beat, pitch: bar, velocity: 100 })) };
  it("retains either half and shifts the last half to tick zero", () => {
    expect(cropPattern(pattern, "first-half", 4).notes.map(n => n.pitch)).toEqual([0, 1, 2, 3]);
    const last = cropPattern(pattern, "last-half", 4);
    expect(last.bars).toBe(4); expect(last.notes[0].tick).toBe(0);
    expect(last.notes.map(n => n.pitch)).toEqual([4, 5, 6, 7]);
    expect(pattern.notes[4].tick).toBe(16 * beat);
  });
  it("finds the longest pattern and repeats a one-bar lane eight times", () => {
    const short = { bars: 1, notes: [pattern.notes[0]] };
    const section = { bars: 8, patterns: { short, long: { bars: 8, notes: [] } } };
    expect(longestSectionPattern(section)).toBe(8);
    expect(compileArrangement({ lanes: [{ id: "short", bank: 0, muted: false }], sections: [section] }, 4).notes).toHaveLength(8);
  });
});

it("updates section duration after a lane pattern changes", () => {
  const a = { lanes: [{ id: "A", bank: 0, muted: false }, { id: "keys", pianoPad: 1, muted: false }], sections: [{ bars: 1, patterns: { A: { bars: 1, notes: [] }, keys: null } }] };
  const changed = replaceLanePattern(a, 0, "keys", { bars: 8, notes: [] });
  expect(changed.sections[0].bars).toBe(8);
  expect(replaceLanePattern(changed, 0, "keys", null).sections[0].bars).toBe(1);
});

it("limits each track to eight visible slots without changing the native master pool", () => {
  const lane = { id: "keys", pianoPad: 1, muted: false };
  const pattern = { bars: 2, notes: [] };
  const changed = setTrackPattern(lane, 7, pattern);
  expect(trackPatterns(changed)).toHaveLength(8);
  expect(trackPatterns(changed)[7]).toEqual(pattern);
  expect(() => setTrackPattern(lane, 8, pattern)).toThrow();
  expect(emptySession().patterns).toHaveLength(32);
});

it("toggles the selected scene pattern off without deleting its stored notes", () => {
  const pattern = { bars: 8, notes: [{ pad: 0, tick: 0, length: 1024, pitch: 0, velocity: 100 }] };
  const lane = setTrackPattern({ id: "A", bank: 0, muted: false }, 7, pattern);
  const arrangement = { lanes: [lane], sections: [{ bars: 1, patterns: { A: null } }] };
  const enabled = toggleScenePattern(arrangement, 0, "A", 7);
  expect(enabled.sections[0].bars).toBe(8);
  expect(compileArrangement(enabled, 4).notes).toHaveLength(1);
  const disabled = toggleScenePattern(enabled, 0, "A", 7);
  expect(disabled.sections[0].patterns.A).toBeNull();
  expect(disabled.lanes[0].patterns?.[7]).toEqual(pattern);
  expect(compileArrangement(toggleScenePattern(disabled, 0, "A", 7), 4).notes).toHaveLength(1);
});
