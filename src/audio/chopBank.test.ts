// Bank D (pads 48 to 63) is the chopped song's bank: no tool puts anything there or moves anything out of it.
import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import { withoutExtraDrums } from "./extraDrums";
import { inChopBank, nextEmptyPad } from "./padMoves";

const pad = (index: number, extra: Partial<Pad> = {}): Pad => ({ index, origIndex: index, name: `p${index}`, sampleId: index, sampleRate: 48000, channelData: [new Float32Array(4)], tune: false, semis: 0, cents: 0, ...extra });
const grid = (indices: number[], extra: Partial<Pad> = {}) => Object.fromEntries(indices.map((i) => [i, pad(i, extra)]));

describe("bank D is the chops' bank", () => {
  it("nextEmptyPad never offers a bank D pad, from any bank", () => {
    const full = grid(Array.from({ length: 47 }, (_, i) => i)); // only pad 47 free in banks A to C
    for (const bank of [0, 1, 2, 3]) expect(nextEmptyPad(full, bank)).toBe(47);
    expect(nextEmptyPad(grid(Array.from({ length: 48 }, (_, i) => i)), 3)).toBeNull();
    expect(nextEmptyPad({}, 3)).toBe(32);
  });

  it("deleting extra drums leaves bank D alone", () => {
    const pads = { ...grid([20], { category: "snare" }), ...grid([55], { category: "snare" }) };
    const next = withoutExtraDrums(pads);
    expect(next[20].placeholder?.kind).toBe("empty");
    expect(next[55]).toBe(pads[55]);
  });

  it("knows which pads are bank D", () => {
    expect([47, 48, 63, 64].map(inChopBank)).toEqual([false, true, true, false]);
  });
});
