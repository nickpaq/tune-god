import { describe, expect, it } from "vitest";
import { validateChopExport } from "./chopValidation";
import { STRETCH_MODE } from "./padSettings";

const chopPad = (index: number, extra: object = {}) => ({ pad: index, sampleId: 100 + index, stretching: true, stretch: STRETCH_MODE.modern, pitch: 2, chokeGroup: 5, oneshot: true, ...extra });
const note = (num: number) => ({ num });
const seq = (...notes: number[][]) => ({ sequences: [...notes.map((n) => ({ noteSequence: { pattern: { notes: n.map(note) } } })), { noteSequence: { pattern: { notes: null } } }] });
const base = { padBase: 0, destinations: [1, 2], padsBefore: [{ pad: 7, sampleId: 7 }], sequencesBefore: [{ noteSequence: { pattern: { notes: null } } }, { noteSequence: { pattern: { notes: null } } }, { noteSequence: { pattern: { notes: null } } }], zipHas: () => true };
const chops = [{ index: 1, label: "Chop 1" }, { index: 2, label: "Chop 2" }];

describe("chop export validation", () => {
  it("passes a sound export in either pattern mode", () => {
    const samplerJson = { pads: [{ pad: 7, sampleId: 7 }, chopPad(1), chopPad(2)] };
    expect(validateChopExport({ ...base, samplerJson, sequence: seq([1], [2]), chops, pattern: "multiple" })).toEqual([]);
    expect(validateChopExport({ ...base, samplerJson, sequence: seq([1, 2]), chops, pattern: "single" })).toEqual([]);
  });
  it("catches wrong stretch, pitch out of range, group and One Shot mismatches", () => {
    const samplerJson = { pads: [{ pad: 7, sampleId: 7 }, chopPad(1, { pitch: 14, stretch: 0 }), chopPad(2, { oneshot: false })] };
    const problems = validateChopExport({ ...base, samplerJson, sequence: seq([1], [2]), chops, pattern: "multiple" });
    expect(problems.join("|")).toMatch(/Modern/);
    expect(problems.join("|")).toMatch(/outside -12/);
    expect(problems.join("|")).toMatch(/One Shot is off/);
  });
  it("catches a changed unselected pad, a note on the wrong pad and a wrong pattern count", () => {
    const samplerJson = { pads: [{ pad: 7, sampleId: 8 }, chopPad(1), chopPad(2)] };
    const problems = validateChopExport({ ...base, samplerJson, sequence: seq([1, 3]), chops, pattern: "multiple" });
    expect(problems).toContain("pad 8 was not chosen but changed");
    expect(problems).toContain("a note refers to the wrong pad");
    expect(problems.some((p) => /patterns were written/.test(p))).toBe(true);
  });
  it("rejects a chop written to a pad that was not chosen", () => {
    const samplerJson = { pads: [{ pad: 7, sampleId: 7 }, chopPad(1), chopPad(2)] };
    expect(validateChopExport({ ...base, destinations: [1], samplerJson, sequence: seq([1], [2]), chops, pattern: "multiple" })).toContain("Chop 2 was written to a pad that was not chosen");
  });
});
