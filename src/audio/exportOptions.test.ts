import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_OPTIONS, mergeExportOptions, PAN_SPREAD_PERCENT, panPlan } from "./exportOptions";
import { emptySequence, isEmpty } from "./exportSong";
import { writeLoopPatterns } from "./loopPatterns";

describe("export options", () => {
  it("default to sounds coming out as they went in, plus the labels, mute groups and melodic loop patterns", () => {
    expect(DEFAULT_EXPORT_OPTIONS).toMatchObject({ normalize: false, masterChain: false, buses: false, panSpread: false, colorsAndLabels: true, chokeGroups: true, melodicPatterns: true, masterStyle: "dynamic" });
  });
  it("take defaults for anything an older save left out", () => {
    expect(mergeExportOptions({ normalize: true })).toEqual({ ...DEFAULT_EXPORT_OPTIONS, normalize: true });
    expect(mergeExportOptions(null)).toEqual(DEFAULT_EXPORT_OPTIONS);
  });
});

describe("panPlan", () => {
  const pads = [
    ...[1, 2, 3, 4].map((sampleId) => ({ sampleId, category: "closedHat" as const })),
    ...[5, 6].map((sampleId) => ({ sampleId, category: "openHat" as const })),
    ...[7, 8, 9, 10].map((sampleId) => ({ sampleId, category: "melodic" as const })),
    { sampleId: 11, category: "melodicLoop" as const },
    { sampleId: 12, category: "melodicLoop" as const },
    { sampleId: 13, category: "kick" as const },
    { sampleId: 14, category: "bass" as const },
    { sampleId: 15, category: "snare" as const },
  ];
  it("spreads hats and melodic sounds, mirrored in pairs, and leaves everything else centred", () => {
    const plan = panPlan(pads);
    for (const id of [13, 14, 15]) expect(plan.has(id), `sample ${id}`).toBe(false);
    for (const group of [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]) {
      const offsets = group.map((id) => (plan.get(id)! - 0.5) * 200);
      expect(offsets.reduce((sum, v) => sum + v, 0)).toBeCloseTo(0, 6);
    }
  });
  it("keeps hats within their narrower limit and melodic sounds within theirs", () => {
    for (let i = 0; i < 20; i++) {
      const plan = panPlan(pads);
      for (const id of [1, 2, 3, 4, 5, 6]) expect(Math.abs((plan.get(id)! - 0.5) * 200)).toBeLessThanOrEqual(PAN_SPREAD_PERCENT.hats + 1e-9);
      for (const id of [7, 8, 9, 10, 11, 12]) expect(Math.abs((plan.get(id)! - 0.5) * 200)).toBeLessThanOrEqual(PAN_SPREAD_PERCENT.melodic + 1e-9);
    }
  });
  it("gives sounds that share a sample the same pan", () => {
    const plan = panPlan([{ sampleId: 1, category: "closedHat" }, { sampleId: 1, category: "closedHat" }, { sampleId: 2, category: "closedHat" }]);
    expect(plan.size).toBe(2);
  });
});

describe("loop patterns when the option is off", () => {
  it("writing none clears the loop patterns an earlier export made", () => {
    const sequences: any[] = Array.from({ length: 32 }, () => emptySequence());
    writeLoopPatterns(sequences, [{ pad: 1, bars: 4 }, { pad: 2, bars: 4 }], 4);
    expect(sequences.filter((s) => !isEmpty(s))).toHaveLength(2);
    writeLoopPatterns(sequences, [], 4);
    expect(sequences.filter((s) => !isEmpty(s))).toHaveLength(0);
  });
});
