import { describe, expect, it } from "vitest";
import { detectMusicTempo, downbeatFromAccents } from "./musicTempo";

const RATE = 44100;
function groove(bpm: number): Float32Array {
  const audio = new Float32Array(RATE * 12);
  let seed = 1;
  for (let k = 0; k * 60 / bpm < 12; k++) {
    const first = Math.round(k * 60 / bpm * RATE);
    for (let i = 0; i < RATE * 0.08 && first + i < audio.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      audio[first + i] += Math.exp(-i / RATE * 50) * (Math.sin(2 * Math.PI * 70 * i / RATE) + 0.3 * (seed / 2 ** 32 * 2 - 1));
    }
  }
  return audio;
}

describe("Music Tempo worker adapter", () => {
  for (const bpm of [120, 127.5]) {
    it(`reads ${bpm} BPM from 44,100 Hz audio without relying on TuneGod's detector`, () => {
      const result = detectMusicTempo(groove(bpm));
      expect(result.bpm).toBeCloseTo(bpm, 0);
      expect(result.downbeatSeconds).toBeGreaterThanOrEqual(0);
      expect(result.downbeatSeconds).toBeLessThan(60 / bpm);
    });
  }
  it("fails on silence instead of reporting a usable grid", () => {
    expect(() => detectMusicTempo(new Float32Array(RATE * 4))).toThrow();
  });
});

describe("downbeat accent alignment", () => {
  it("uses a repeated clear accent rather than assuming the first tracked beat is bar 1", () => {
    const beats = Array.from({ length: 16 }, (_, i) => i * 0.5);
    const audio = new Float32Array(RATE * 8);
    beats.forEach((beat, i) => { for (let frame = 0; frame < RATE * 0.05; frame++) audio[Math.round(beat * RATE) + frame] = (i % 4 === 2 ? 1 : 0.2) * Math.sin(frame * 2 * Math.PI * 80 / RATE); });
    expect(downbeatFromAccents(audio, beats)).toBe(1);
  });
  it("keeps ambiguous or short beat tracks at their original phase", () => {
    expect(downbeatFromAccents(groove(120), Array.from({ length: 16 }, (_, i) => i * 0.5))).toBe(0);
    expect(downbeatFromAccents(new Float32Array(100), [0.01, 0.02])).toBe(0.01);
  });
});
