import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import {
  assign,
  chopLimit,
  destinationPads,
  orderedDestinations,
  overwriteMessage,
  overwrites,
  padName,
  selectAll,
  selectUnused,
  summarize,
  tapPreviews,
  toggle,
} from "./chopDestinations";

const pad = (index: number, extra: Partial<Pad> = {}): Pad => ({ index, origIndex: index, name: `s${index}`, sampleId: index, sampleRate: 44100, channelData: [new Float32Array(1)], tune: false, semis: 0, cents: 0, ...extra }) as Pad;
const pads = destinationPads(
  { 0: pad(0), 2: pad(2), 17: pad(17, { locked: true }), 20: pad(20, { placeholder: { kind: "empty", label: "Empty" } as any }), 63: pad(63) },
  (p) => p.name,
);

describe("chop destinations", () => {
  it("names pads by bank and number", () => {
    expect([0, 15, 16, 47, 48, 63].map(padName)).toEqual(["A1", "A16", "B1", "C16", "D1", "D16"]);
  });
  it("counts an Empty placeholder as empty, and knows locked pads", () => {
    expect(pads[20].occupied).toBe(false);
    expect(pads[0]).toMatchObject({ occupied: true, name: "s0" });
    expect(pads[17].locked).toBe(true);
  });
  it("selects all unused pads, replacing the selection, and never the occupied", () => {
    const s = selectUnused(pads);
    expect(s.has(0)).toBe(false);
    expect(s.has(20)).toBe(true);
    expect(s.size).toBe(64 - 4);
    expect(summarize(pads, s)).toEqual({ selected: 60, total: 64, empty: 60, overwrite: 0 });
  });
  it("selects all pads except locked ones and counts the overwrites from the real pads", () => {
    const s = selectAll(pads);
    expect(s.size).toBe(63);
    expect(summarize(pads, s)).toEqual({ selected: 63, total: 64, empty: 60, overwrite: 3 });
  });
  it("only previews an occupied pad on the tap that selects it", () => {
    let s = new Set<number>();
    expect(tapPreviews(s, pads[0])).toBe(true);
    s = toggle(s, pads[0]);
    expect(tapPreviews(s, pads[0])).toBe(false); // second tap deselects without playing
    s = toggle(s, pads[0]);
    expect(s.has(0)).toBe(false);
    expect(tapPreviews(s, pads[0])).toBe(true);
    expect(tapPreviews(s, pads[1])).toBe(false); // empty pads never preview
    expect(toggle(s, pads[17]).has(17)).toBe(false); // locked
  });
  it("orders destinations bank A to D, ascending, skipping the unselected", () => {
    expect(orderedDestinations(pads, new Set([51, 18, 0, 2]))).toEqual([0, 2, 18, 51]); // A1, A3, B3, D4
    expect(orderedDestinations(pads, new Set([51, 17, 0, 2]))).toEqual([0, 2, 51]); // 17 is locked
    expect(orderedDestinations(pads, new Set([51, 18, 0, 2]))).toEqual([0, 2, 18, 51]);
  });
  it("limits the chop count by pads, chops and Koala's pattern slots", () => {
    expect(chopLimit(40, 100, 32, "multiple")).toEqual({ max: 32, by: "patterns" });
    expect(chopLimit(40, 100, 32, "single")).toEqual({ max: 40, by: "pads" });
    expect(chopLimit(40, 12, 32, "single")).toEqual({ max: 12, by: "chops" });
    expect(chopLimit(0, 12, 32, "single").max).toBe(0);
    expect(assign([5, 6, 7], 2)).toEqual([5, 6]);
  });
  it("lists what is overwritten with banks, pads and names", () => {
    const list = overwrites(pads, [0, 2, 20, 63]);
    expect(list.map((p) => p.index)).toEqual([0, 2, 63]);
    const text = overwriteMessage(list);
    expect(text).toContain("3 existing samples");
    expect(text).toContain("Bank A: A1 (s0), A3 (s2)");
    expect(text).toContain("Bank D: D16 (s63)");
  });
});
