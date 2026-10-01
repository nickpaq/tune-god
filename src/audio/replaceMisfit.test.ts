import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import { replaceMisfit } from "./padMoves";
import type { CategoryId } from "./classify";

const pad = (index: number, category: CategoryId): Pad =>
  ({ index, origIndex: index, name: `p${index}`, sampleId: index, sampleRate: 44100, channelData: [new Float32Array(1)], tune: false, semis: 0, cents: 0, category }) as Pad;

describe("replaceMisfit", () => {
  it("swaps in a sound of the slot's category from a later bank", () => {
    const pads = { 0: pad(0, "perc"), 20: pad(20, "kick"), 21: pad(21, "kick") };
    const next = replaceMisfit(pads, 0, "kick", "Kick");
    expect(next[0].origIndex).toBe(20);
    expect(next[20].origIndex).toBe(0);
  });

  it("leaves a missing gap when no sound of that category exists", () => {
    const pads = { 0: pad(0, "perc"), 20: pad(20, "snare") };
    const next = replaceMisfit(pads, 0, "kick", "Kick");
    expect(next[0].placeholder?.kind).toBe("missing");
    expect(next[16].origIndex).toBe(0);
  });
});
