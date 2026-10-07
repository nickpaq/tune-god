import { describe, expect, it } from "vitest";
import { playbackFor, STRETCH_MODE } from "./padSettings";

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

describe("playback rules by sound type", () => {
  it("melodic loops: mute group 4, one-shot on, loop off, modern stretch", () =>
    expect(playbackFor("melodicLoop")).toMatchObject({ chokeGroup: 4, oneShot: true, loop: false, stretch: "modern" }));

  it("melodic one-shots: no mute group, one-shot off, release at the maximum, stretch off", () =>
    expect(playbackFor("melodic")).toMatchObject({ chokeGroup: 0, oneShot: false, release: 1, stretch: "off" }));

  it("drums: one-shot on, no mute group, loop and stretch off; the hats keep their mute group", () => {
    for (const c of ["kick", "snare", "clap", "cymbal", "perc"] as const) expect(playbackFor(c), c).toMatchObject({ chokeGroup: 0, oneShot: true, loop: false, stretch: "off" });
    for (const c of ["closedHat", "openHat"] as const) expect(playbackFor(c), c).toMatchObject({ chokeGroup: 5, oneShot: true, loop: false, stretch: "off" });
  });

  it("the snare's tone is a little under the middle and no other drum has one", () => {
    expect(playbackFor("snare")!.tone).toBeLessThan(0);
    expect(playbackFor("snare")!.tone).toBeGreaterThan(-0.3);
    expect(playbackFor("kick")!.tone).toBeUndefined();
  });

  it("drum and perc loops stretch in beats mode, melodic loops in the default mode", () => {
    for (const c of ["drumLoop", "percLoop"] as const) expect(playbackFor(c)!.stretch, c).toBe("beats");
    expect(STRETCH_MODE.beats).not.toBe(STRETCH_MODE.modern);
  });

  it("808 and bass: one-shot on", () => expect(playbackFor("bass")!.oneShot).toBe(true));
});
