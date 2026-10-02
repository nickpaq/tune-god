import { describe, expect, it } from "vitest";
import { formatTrim, splitTrim, trimCents } from "./theory";

describe("pitch trim", () => {
  it("joins and splits semitones and cents without loss", () => {
    for (const total of [0, 1, 99, 100, 137, -1, -100, -250, 1200, -1200]) {
      const { semis, cents } = splitTrim(total);
      expect(trimCents(semis, cents)).toBe(total);
      expect(Math.abs(cents)).toBeLessThan(100);
    }
  });

  it("keeps one sign for both parts", () => {
    expect(splitTrim(-137)).toEqual({ semis: -1, cents: -37 });
    expect(splitTrim(137)).toEqual({ semis: 1, cents: 37 });
  });

  it("formats as signed semitones", () => {
    expect(formatTrim(137)).toBe("+1.37");
    expect(formatTrim(-50)).toBe("-0.50");
    expect(formatTrim(0)).toBe("0.00");
  });
});
