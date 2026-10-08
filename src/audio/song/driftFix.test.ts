import { describe, expect, it } from "vitest";
import { correctDrift } from "./driftFix";
import { baseGrid } from "./chopMarks";
import { lineFrame } from "./tapGrid";

const RATE = 11025;

/** A click track: a decaying 60 Hz thump on every beat of `beat` frames from `origin`, noise between, a snare-like burst on the offbeats. */
function track(beat: number, origin: number, beats: number): Float32Array {
  const out = new Float32Array(Math.round(origin + (beats + 1) * beat));
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
  for (let i = 0; i < out.length; i++) out[i] = noise();
  for (let k = 0; k < beats; k++) {
    const at = Math.round(origin + k * beat);
    for (let i = 0; i < 900 && at + i < out.length; i++) out[at + i] += Math.sin((2 * Math.PI * 60 * i) / RATE + 0.3) * Math.exp(-i / 300);
    const snare = Math.round(at + beat / 2);
    for (let i = 0; i < 400 && snare + i < out.length; i++) out[snare + i] += noise() * 20 * Math.exp(-i / 100);
  }
  return out;
}

describe("correctDrift", () => {
  it("finds the exact tempo a slightly wrong detection missed", () => {
    const trueBeat = 5512.5 * 1.004; // 0.4 % slow: a bar late by 1/5 of a beat after 50 beats
    const mono = track(trueBeat, 2000, 120);
    const grid = baseGrid(RATE, 4, (60 * RATE) / 5512.5, 2000 / RATE);
    const fix = correctDrift(mono, grid);
    expect(fix.matches).toBeGreaterThan(100);
    expect(fix.grid.segments[0].beatFrames).toBeCloseTo(trueBeat, 0);
    for (const n of [0, 40, 100]) expect(Math.abs(lineFrame(fix.grid, n) - (2000 + n * trueBeat))).toBeLessThan(trueBeat * 0.02);
  });

  it("re-locks where the song speeds up past the limit", () => {
    const a = track(5512.5, 2000, 40);
    const b = track(5512.5 * 0.97, 2000 + 40 * 5512.5, 40);
    const mono = new Float32Array(b.length);
    mono.set(a.subarray(0, Math.round(2000 + 40 * 5512.5)));
    mono.set(b.subarray(Math.round(2000 + 40 * 5512.5)), Math.round(2000 + 40 * 5512.5));
    const fix = correctDrift(mono, baseGrid(RATE, 4, 120, 2000 / RATE));
    expect(fix.relocks).toBeGreaterThan(0);
    const frame = 2000 + 40 * 5512.5 + 30 * 5512.5 * 0.97;
    expect(Math.abs(lineFrame(fix.grid, 70) - frame)).toBeLessThan(5512.5 * 0.05);
  });

  it("leaves the grid alone when nothing else sounds like the first downbeat", () => {
    const mono = new Float32Array(RATE * 20);
    for (let i = 0; i < 900; i++) mono[2000 + i] = Math.sin((2 * Math.PI * 60 * i) / RATE) * Math.exp(-i / 300);
    const grid = baseGrid(RATE, 4, 120, 2000 / RATE);
    expect(correctDrift(mono, grid).grid).toBe(grid);
  });
});
