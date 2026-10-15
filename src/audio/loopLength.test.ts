import { describe, expect, it } from "vitest";
import { loopStretchBeats, snapLoopBars } from "./padSettings";

describe("loop stretch length", () => {
  it("snaps to 2, 4, 8 or 16 bars only", () => {
    for (const bars of [0.5, 1, 3, 5, 6, 7, 7.4, 9, 12, 15, 20, 40]) expect([2, 4, 8, 16]).toContain(snapLoopBars(bars));
    expect(snapLoopBars(7)).toBe(8);
    expect(snapLoopBars(1)).toBe(2);
    expect(snapLoopBars(31)).toBe(16);
  });
  it("writes beats from the name's tempo, else the project's", () => {
    // 8 bars of 4/4 at 120 bpm is 16 s
    expect(loopStretchBeats(16, 120, 140, 4)).toBe(32);
    expect(loopStretchBeats(16, undefined, 120, 4)).toBe(32);
    expect(loopStretchBeats(13.7, 140, 140, 4)).toBe(32);
  });
});
