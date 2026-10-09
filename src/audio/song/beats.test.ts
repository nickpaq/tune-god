import { describe, expect, it } from "vitest";
import { analyzeSongKey, chromaOf, keyOfChroma } from "./beats";

const RATE = 22050;

/** A song: kicks on every beat (the first of each bar harder, with a bass note), hats between, and a chord held for each bar. */
function song(bpm: number, beatsPerBar: number, startSeconds: number, seconds: number, chord = [261.63, 329.63, 392]): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  const beat = 60 / bpm;
  let seed = 1;
  const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (let k = 0; startSeconds + k * beat < seconds; k++) {
    const t0 = startSeconds + k * beat;
    const first = k % beatsPerBar === 0;
    const kickLength = Math.round(0.12 * RATE);
    for (let i = 0; i < kickLength; i++) {
      const t = i / RATE;
      const f = 50 + 90 * Math.exp(-t * 40);
      const j = Math.round(t0 * RATE) + i;
      if (j < out.length) out[j] += (first ? 0.9 : 0.55) * Math.exp(-t * 25) * Math.sin(2 * Math.PI * f * t);
    }
    if (first) {
      const bassLength = Math.round(beat * 0.9 * RATE);
      for (let i = 0; i < bassLength; i++) {
        const j = Math.round(t0 * RATE) + i;
        if (j < out.length) out[j] += 0.3 * Math.exp(-i / RATE / 0.5) * Math.sin((2 * Math.PI * 65.41 * i) / RATE);
      }
    }
    const hat = Math.round((t0 + beat / 2) * RATE);
    for (let i = 0; i < Math.round(0.03 * RATE); i++) if (hat + i < out.length) out[hat + i] += 0.12 * noise() * Math.exp(-i / RATE / 0.01);
  }
  // A pad chord from the start of the music.
  for (let i = Math.round(startSeconds * RATE); i < out.length; i++) {
    for (const f of chord) out[i] += 0.05 * Math.sin((2 * Math.PI * f * i) / RATE);
  }
  return out;
}

it("reads song harmony independently of tempo", () => {
  expect(analyzeSongKey(song(120, 4, 0.5, 40), RATE).pc).toBe(0);
});

describe("keyOfChroma", () => {
  const profile = (notes: number[]) => {
    const chroma = new Float64Array(12);
    for (const n of notes) chroma[n % 12] += 1;
    chroma[notes[0] % 12] += 1;
    return chroma;
  };

  it("names a major and a minor key from their notes", () => {
    expect(keyOfChroma(profile([0, 2, 4, 5, 7, 9, 11]))).toMatchObject({ pc: 0, minor: false });
    expect(keyOfChroma(profile([9, 11, 0, 2, 4, 5, 8]))).toMatchObject({ pc: 9, minor: true });
  });
});

describe("chromaOf", () => {
  it("puts a sine on its own note, even when the song is tuned a little off A=440", () => {
    const x = new Float32Array(RATE * 4);
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 440 * 2 ** (-30 / 1200) * i) / RATE);
    const chroma = chromaOf(x, RATE);
    expect(chroma.indexOf(Math.max(...chroma))).toBe(9);
  });
});
