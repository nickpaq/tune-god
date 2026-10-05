import { describe, expect, it } from "vitest";
import { TapDetector } from "./tapDetector";

const RATE = 44100;

function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/** `seconds` of low-level noise (the room, or the song heard from the speaker) with clicks of `click` amplitude at the given times. */
function signal(seconds: number, background: number, clicks: number[], click: number, seed = 1): Float32Array {
  const random = noise(seed);
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = random() * 2 * background;
  for (const t of clicks) {
    const at = Math.round(t * RATE);
    for (let j = 0; j < 90; j++) out[at + j] += (random() * 2 || 0.5) * click * Math.exp(-j / 25);
  }
  return out;
}

/** Runs the detector over blocks of 512 samples and returns the times of the taps, in seconds. */
function detect(samples: Float32Array, sensitivity = 0.5): number[] {
  const detector = new TapDetector(RATE, { sensitivity });
  const times: number[] = [];
  for (let from = 0; from < samples.length; from += 512) {
    const block = samples.subarray(from, Math.min(samples.length, from + 512));
    for (const at of detector.process(block)) times.push((from + at) / RATE);
  }
  return times;
}

describe("TapDetector", () => {
  const knocks = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

  it("hears every knock, within a few milliseconds, and nothing else", () => {
    const times = detect(signal(3.5, 0.002, knocks, 0.6));
    expect(times).toHaveLength(knocks.length);
    times.forEach((t, i) => expect(Math.abs(t - knocks[i])).toBeLessThan(0.005));
  });

  it("hears knocks over a steady background such as the song from the speaker", () => {
    const times = detect(signal(3.5, 0.08, knocks, 0.9));
    expect(times).toHaveLength(knocks.length);
  });

  it("does not take a continuous noise for taps", () => {
    expect(detect(signal(3, 0.3, [], 0))).toEqual([]);
  });

  it("counts a knock that rings as one tap", () => {
    const samples = signal(2, 0.002, [], 0);
    const at = Math.round(0.5 * RATE);
    for (let j = 0; j < 4000; j++) samples[at + j] += 0.5 * Math.sin(j * 0.9) * Math.exp(-j / 1500);
    expect(detect(samples)).toHaveLength(1);
  });

  it("is more sensitive when asked to be", () => {
    const soft = signal(3.5, 0.002, knocks, 0.05);
    expect(detect(soft, 1).length).toBeGreaterThan(detect(soft, 0).length);
  });
});
