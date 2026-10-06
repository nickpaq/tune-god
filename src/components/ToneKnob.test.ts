import { describe, expect, it } from "vitest";
import { knobRows } from "./ToneKnob";

const lit = (rows: string[]) => rows.map((r) => [...r].filter((c) => c === "#").length).reduce((a, b) => a + b, 0);

describe("knobRows", () => {
  it("draws a square grid with a ring and a pointer that turns with the value", () => {
    const low = knobRows(0);
    const high = knobRows(1);
    expect(low).toHaveLength(17);
    expect(low.every((r) => r.length === 17)).toBe(true);
    expect(lit(low)).toBeGreaterThan(30);
    expect(low).not.toEqual(high);
    // the middle points straight up: a lit cell above the centre, none below it
    const mid = knobRows(0.5);
    expect(mid[5][8]).toBe("#");
    expect(mid[11][8]).toBe(".");
  });
  it("is mirrored for the two ends of the sweep", () => {
    const low = knobRows(0).map((r) => [...r].reverse().join(""));
    expect(low).toEqual(knobRows(1));
  });
});
