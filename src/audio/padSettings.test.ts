import { describe, expect, it } from "vitest";
import { playbackFor } from "./padSettings";

describe("per-pad EQ by sound type", () => {
  it("leaves the kick and bass alone and keeps every highpass inside the EQ's 20 Hz to 20 kHz range", () => {
    expect(playbackFor("kick")?.eq).toBeUndefined();
    expect(playbackFor("bass")?.eq).toBeUndefined();
    expect(playbackFor("closedHat")?.eq?.highpassHz).toBe(300);
    for (const c of ["snare", "clap", "closedHat", "openHat", "cymbal", "perc", "vox", "fx", "melodic", "melodicLoop", "percLoop"] as const) {
      expect(playbackFor(c)?.eq?.highpassHz, c).toBeGreaterThanOrEqual(20);
    }
  });

  it("warms the hats and cymbals with a small high-shelf cut and keeps the hat mute group", () => {
    expect(playbackFor("closedHat")).toMatchObject({ chokeGroup: 5, oneShot: true, eq: { highShelfDb: -2 } });
    expect(playbackFor("cymbal")?.eq?.highShelfDb).toBe(-2);
  });
});

describe("melodic loops", () => {
  it("are written with one-shot off", () => expect(playbackFor("melodicLoop")).toMatchObject({ oneShot: false }));
});
