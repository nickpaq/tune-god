import { describe, expect, it } from "vitest";
import { playbackFor } from "./padSettings";

describe("per-pad EQ by sound type", () => {
  it("leaves the kick and bass alone and keeps every highpass at or under 180 Hz", () => {
    expect(playbackFor("kick")?.eq).toBeUndefined();
    expect(playbackFor("bass")?.eq).toBeUndefined();
    for (const c of ["snare", "clap", "closedHat", "openHat", "cymbal", "perc", "vox", "fx", "melodic", "melodicLoop", "percLoop"] as const) {
      expect(playbackFor(c)?.eq?.highpassHz, c).toBeLessThanOrEqual(180);
    }
  });

  it("warms the hats and cymbals with a small high-shelf cut and keeps the hat mute group", () => {
    expect(playbackFor("closedHat")).toMatchObject({ chokeGroup: 5, oneShot: true, eq: { highShelfDb: -2 } });
    expect(playbackFor("cymbal")?.eq?.highShelfDb).toBe(-2);
  });
});
