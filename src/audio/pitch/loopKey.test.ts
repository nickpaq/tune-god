import { describe, expect, it } from "vitest";
import { loopKey } from "./loopKey";

const RATE = 22050;

/** A note with a few harmonics, so it reads as an instrument and not a bare sine. */
function note(out: Float32Array, midi: number, from: number, to: number, amp = 0.2) {
  const f = 440 * 2 ** ((midi - 69) / 12);
  for (let i = Math.round(from * RATE); i < Math.min(out.length, Math.round(to * RATE)); i++) {
    const t = i / RATE;
    let v = 0;
    for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
    out[i] += amp * v;
  }
}

/** A loop of chords, each held for `beat` seconds; `chords` are lists of MIDI notes. */
function loop(chords: number[][], beat = 0.5): Float32Array {
  const out = new Float32Array(Math.round(chords.length * beat * RATE) + RATE);
  chords.forEach((c, i) => c.forEach((m) => note(out, m, i * beat, (i + 1) * beat)));
  return out;
}

const triad = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7];

describe("loopKey", () => {
  it("finds A minor as A (pitch class 9) for a loop in A minor", () => {
    // Am, F, C, G
    const x = loop([triad(57, true), triad(53, false), triad(60, false), triad(55, false), triad(57, true), triad(53, false), triad(60, false), triad(55, false)]);
    expect(loopKey(x, RATE)?.minorPc).toBe(9);
  });

  it("gives the relative minor for a loop in the relative major (C major is A, a whole note)", () => {
    // C, F, G, C
    const x = loop([triad(60, false), triad(53, false), triad(55, false), triad(60, false), triad(60, false), triad(53, false), triad(55, false), triad(60, false)]);
    const k = loopKey(x, RATE);
    expect(k?.minorPc).toBe(9);
    expect(Number.isInteger(k?.midi)).toBe(true);
  });

  it("follows the key: the same progression a fifth higher gives a minor tonic a fifth higher", () => {
    const up = (c: number[]) => c.map((m) => m + 7);
    const x = loop([triad(57, true), triad(53, false), triad(60, false), triad(55, false), triad(57, true), triad(53, false), triad(60, false), triad(55, false)].map(up));
    expect(loopKey(x, RATE)?.minorPc).toBe((9 + 7) % 12);
  });

  it("returns null for silence", () => {
    expect(loopKey(new Float32Array(RATE * 2), RATE)).toBeNull();
  });
});
