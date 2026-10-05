import { describe, expect, it } from "vitest";
import { estimateTempo, LOCK_TAPS } from "./tapTempo";

/** A small deterministic noise source, so the tests do not depend on luck. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/** Taps on a steady beat, each landing up to `jitter` seconds either side of it. */
function steady(count: number, period: number, start = 1.3, jitter = 0.02, seed = 7): number[] {
  const random = noise(seed);
  return Array.from({ length: count }, (_, i) => start + i * period + random() * 2 * jitter);
}

describe("estimateTempo", () => {
  it("needs two taps", () => {
    expect(estimateTempo([])).toBeNull();
    expect(estimateTempo([1])).toBeNull();
    expect(estimateTempo([1, 1.5])).not.toBeNull();
  });

  it("finds the tempo and phase of steady taps", () => {
    const e = estimateTempo(steady(24, 0.5))!;
    expect(e.bpm).toBeCloseTo(120, 0);
    expect(e.period).toBeCloseTo(0.5, 2);
    expect(e.ignored).toEqual([]);
    expect(e.locked).toBe(true);
    // beat 0 is where the first tap was, within a tap's jitter
    expect(Math.abs(e.origin - 1.3)).toBeLessThan(0.03);
  });

  it("is not locked until enough taps have been made", () => {
    expect(estimateTempo(steady(LOCK_TAPS - 1, 0.5))!.locked).toBe(false);
    expect(estimateTempo(steady(LOCK_TAPS, 0.5))!.locked).toBe(true);
  });

  it("ignores a single bad hit and keeps the tempo", () => {
    const clean = steady(24, 0.5);
    const bad = [...clean];
    bad.splice(12, 0, clean[12] + 0.19); // an extra hit between the beats
    const e = estimateTempo(bad)!;
    const reference = estimateTempo(clean)!;
    expect(e.ignored).toEqual([clean[12] + 0.19]);
    expect(e.accepted).toEqual(clean);
    expect(e.bpm).toBeCloseTo(reference.bpm, 6);
  });

  it("ignores a tap that lands badly off its beat", () => {
    const taps = steady(24, 0.5);
    const late = taps[15] + 0.18; // a beat hit well late
    taps[15] = late;
    const e = estimateTempo(taps)!;
    expect(e.ignored).toEqual([late]);
    expect(e.bpm).toBeCloseTo(120, 0);
  });

  it("ignores a double tap (a bounce)", () => {
    const taps = steady(20, 0.5);
    taps.splice(8, 0, taps[7] + 0.05);
    const e = estimateTempo(taps)!;
    expect(e.ignored).toHaveLength(1);
    expect(e.bpm).toBeCloseTo(120, 0);
  });

  it("copes with a missed beat", () => {
    const taps = steady(24, 0.5);
    taps.splice(10, 1);
    const e = estimateTempo(taps)!;
    expect(e.ignored).toEqual([]);
    expect(e.bpm).toBeCloseTo(120, 0);
  });

  it("is not thrown by a bad hit among the first taps", () => {
    const taps = steady(26, 0.5);
    taps.splice(1, 0, taps[0] + 0.23); // a stray hit right after the first tap
    const e = estimateTempo(taps)!;
    expect(e.bpm).toBeCloseTo(120, 0);
  });

  it("follows the player when the tempo really changes", () => {
    const first = steady(14, 0.5);
    const second = steady(16, 0.4, first[first.length - 1] + 0.4, 0.01, 3);
    const e = estimateTempo([...first, ...second])!;
    expect(e.bpm).toBeCloseTo(150, 0);
  });

  it("is steady at other tempos", () => {
    expect(estimateTempo(steady(30, 0.75))!.bpm).toBeCloseTo(80, 0);
    expect(estimateTempo(steady(30, 0.3))!.bpm).toBeCloseTo(200, 0);
  });
});
