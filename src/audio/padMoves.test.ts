import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import { movePad } from "./padMoves";

const pad = (index: number, extra: Partial<Pad> = {}): Pad => ({
  index,
  origIndex: index,
  name: "snare.wav",
  sampleId: 7,
  sampleRate: 44100,
  channelData: [new Float32Array(1)],
  tune: false,
  semis: 0,
  cents: 0,
  ...extra,
});

describe("movePad", () => {
  it("changes only the pad's slot, so a sound dragged onto a layout slot keeps its category, tune state and trims", () => {
    const snare = pad(40, { category: "snare", tune: true, tuneLocked: true, semis: 2, cents: -10 });
    const moved = movePad({ 40: snare }, 40, 9)[9];
    expect(moved).toEqual({ ...snare, index: 9 });
    expect(moved.origIndex).toBe(40);
  });
});
