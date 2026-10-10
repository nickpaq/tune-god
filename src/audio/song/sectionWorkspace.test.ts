import { describe, expect, it } from "vitest";
import { packArrangement, pieceAudio } from "./sectionWorkspace";
import type { MakerChop } from "./patternMaker";
const piece: MakerChop = {
  slice: 0,
  start: 125 + 5 * 125,
  length: 1000,
  steps: 8,
  bars: 0.5,
  barIndex: 0,
  colorIndex: 0,
  color: "#f00",
};
describe("preview and packed Koala audio", () => {
  const data = [
    Float32Array.from({ length: 10000 }, (_, i) => Math.sin(i * 0.04)),
    Float32Array.from({ length: 10000 }, (_, i) => Math.cos(i * 0.03)),
  ];
  it("preserves the grid duration and fades every channel without changing the original source", () => {
    const before = data[0].slice();
    const audio = pieceAudio(data, piece, 3, 500, 1000);
    expect(audio[0]).toHaveLength(375);
    for (const channel of audio) {
      expect(Math.abs(channel[0])).toBe(0);
      expect(Math.abs(channel.at(-1)!)).toBe(0);
    }
    expect(data[0]).toEqual(before);
  });
  it("packs overlapping pieces independently, reuses repeated choices, and leaves silence as a note gap", () => {
    const other = { ...piece, start: piece.start + 250 };
    const packed = packArrangement(
      data,
      [piece, other],
      [
        { kind: "chop", chop: 0, steps: 8 },
        { kind: "silence", steps: 4 },
        { kind: "chop", chop: 1, steps: 8 },
        { kind: "chop", chop: 0, steps: 8 },
      ],
      500,
      1000,
    );
    expect(packed.layout.starts).toEqual([0, 1000]);
    expect(packed.notes).toEqual([
      { slice: 0, start: 0, steps: 8 },
      { slice: 1, start: 12, steps: 8 },
      { slice: 0, start: 20, steps: 8 },
    ]);
    expect(packed.channelData[0].subarray(0, 1000)).toEqual(
      pieceAudio(data, piece, 8, 500, 1000, { fadeOut: 0.005 })[0],
    );
    expect(packed.channelData[1].subarray(1000)).toEqual(
      pieceAudio(data, other, 8, 500, 1000, { fadeIn: 0.003 })[1],
    );
  });
  it("uses short asymmetric envelopes around silence without shortening notes", () => {
    const constant = [new Float32Array(10000).fill(1)];
    const out = pieceAudio(constant, piece, 8, 500, 1000, {
      fadeOut: 0.005,
    })[0];
    const incoming = pieceAudio(constant, piece, 8, 500, 1000, {
      fadeIn: 0.003,
    })[0];
    expect(out.length).toBe(1000);
    expect(out[996]).toBeCloseTo(0.6);
    expect(out[999]).toBe(0);
    expect(incoming[0]).toBe(0);
    expect(incoming[1]).toBeCloseTo(1 / 3);
    expect(incoming[3]).toBe(1);
    expect(constant[0][piece.start]).toBe(1);
  });
  it("supports silence-only sequences and more than 127 unique pieces", () => {
    const silent = packArrangement(
      data,
      [],
      [{ kind: "silence", steps: 4 }],
      500,
      1000,
    );
    expect(silent.layout.starts).toEqual([0]);
    expect(silent.notes).toEqual([]);
    const many = Array.from({ length: 128 }, (_, i) => ({
      ...piece,
      start: i * 5,
    }));
    expect(
      packArrangement(
        data,
        many,
        many.map((_, chop) => ({ kind: "chop", chop, steps: 1 })),
        500,
        1000,
      ).layout.starts,
    ).toHaveLength(128);
  });
});
