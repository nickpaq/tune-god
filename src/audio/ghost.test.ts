import { describe, expect, it } from "vitest";
import { makeGhostAudio } from "./ghost";

const tone = (hz: number, sr = 44100) => Float32Array.from({ length: sr }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr));
const peak = (d: Float32Array) => d.reduce((m, v, i) => (i > 4000 ? Math.max(m, Math.abs(v)) : m), 0);

describe("makeGhostAudio", () => {
  it("lowers a low tone by about the level for its kind and leaves the source alone", () => {
    const src = [tone(60)];
    const snare = makeGhostAudio(src, 44100, "ghostSnare");
    const kick = makeGhostAudio(src, 44100, "softKick");
    expect(20 * Math.log10(peak(snare[0]))).toBeCloseTo(-14, 0);
    expect(20 * Math.log10(peak(kick[0]))).toBeCloseTo(-8, 0);
    expect(peak(src[0])).toBeCloseTo(1, 2);
  });

  it("dulls high frequencies more than low ones", () => {
    const high = peak(makeGhostAudio([tone(12000)], 44100, "ghostSnare")[0]);
    const low = peak(makeGhostAudio([tone(200)], 44100, "ghostSnare")[0]);
    expect(high).toBeLessThan(low * 0.6);
  });

  it("keeps length and channel count", () => {
    const out = makeGhostAudio([tone(100), tone(100)], 44100, "softKick");
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(44100);
  });
});
