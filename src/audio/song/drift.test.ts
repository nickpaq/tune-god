import { describe, expect, it } from "vitest";
import { attackEnvelope, checkLine, findDriftMarkers } from "./drift";
import { gridFromTaps } from "./tapGrid";

const RATE = 44100;

/** A song of `seconds` with a kick at each given time, and a steady quiet bed under it. */
function song(seconds: number, kicks: number[], bed = 0.02): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  let s = 5;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    out[i] = (s / 4294967296 - 0.5) * bed;
  }
  for (const t of kicks) {
    const at = Math.round(t * RATE);
    for (let j = 0; j < 4000 && at + j < out.length; j++) out[at + j] += 0.8 * Math.sin(j * 0.03 * (1 - j / 9000)) * Math.exp(-j / 1200);
  }
  return out;
}

const beats = (from: number, to: number, period: number) => {
  const out: number[] = [];
  for (let t = from; t < to; t += period) out.push(t);
  return out;
};

const grid = gridFromTaps({ period: 0.5, origin: 0.04 }, RATE, 4);

describe("checkLine", () => {
  const mono = song(10, beats(0.04, 10, 0.5));
  const env = attackEnvelope(mono);

  it("finds the attack on a line, and how far off it is", () => {
    const on = checkLine(env, 0.04 * RATE + 5 * 0.5 * RATE, 0.5 * RATE);
    expect(on.clear).toBe(true);
    expect(Math.abs(on.offset)).toBeLessThan(0.006 * RATE);
    const late = checkLine(env, 0.04 * RATE + 5 * 0.5 * RATE + 0.05 * RATE, 0.5 * RATE);
    expect(late.clear).toBe(true);
    expect(late.offset / RATE).toBeCloseTo(-0.05, 1);
  });

  it("finds no clear attack in a bed with nothing in it", () => {
    expect(checkLine(attackEnvelope(song(10, [])), 5 * RATE, 0.5 * RATE).clear).toBe(false);
  });
});

describe("findDriftMarkers", () => {
  it("marks nothing for a song that stays on the grid", () => {
    expect(findDriftMarkers(attackEnvelope(song(40, beats(0.04, 40, 0.5))), grid, 40 * RATE)).toEqual([]);
  });

  it("marks the last confirmed line where the song speeds up and the grid stops fitting", () => {
    // on the grid for 20 s (line 40), then 126 BPM: the kicks pull away from the lines
    const kicks = [...beats(0.04, 20.04, 0.5), ...beats(20.04, 40, 60 / 126)];
    const markers = findDriftMarkers(attackEnvelope(song(40, kicks)), grid, 40 * RATE);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toBeGreaterThanOrEqual(36);
    expect(markers[0]).toBeLessThanOrEqual(46);
  });

  it("marks where the beat drops away to nothing the audio can confirm", () => {
    const markers = findDriftMarkers(attackEnvelope(song(40, beats(0.04, 16.04, 0.5))), grid, 40 * RATE);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toBeGreaterThanOrEqual(28);
    expect(markers[0]).toBeLessThanOrEqual(34);
  });

  it("does not mark a song that starts with nothing to hold the beat, nor one grid that is out all the way", () => {
    expect(findDriftMarkers(attackEnvelope(song(40, beats(20.04, 40, 0.5))), grid, 40 * RATE)).toEqual([]);
    expect(findDriftMarkers(attackEnvelope(song(40, beats(0.04 + 0.12, 40, 0.5))), grid, 40 * RATE)).toEqual([]);
  });

  it("marks each place it comes apart, with a sound stretch between", () => {
    const kicks = [...beats(0.04, 12, 0.5), ...beats(20.04, 32, 0.5)];
    const markers = findDriftMarkers(attackEnvelope(song(44, kicks)), grid, 44 * RATE);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toBeGreaterThanOrEqual(20);
    expect(markers[0]).toBeLessThanOrEqual(24);
    expect(markers[1]).toBeGreaterThanOrEqual(60);
    expect(markers[1]).toBeLessThanOrEqual(64);
  });
});
