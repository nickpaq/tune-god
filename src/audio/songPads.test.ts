import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import { freeSongSlots, makeSectionPads } from "./songPads";

const pad = (index: number, frames = 10): Pad => ({ index, origIndex: index, name: "song", sampleId: 7, sampleRate: 48000, channelData: [new Float32Array(frames)], tune: false, semis: 0, cents: 0 });

describe("freeSongSlots", () => {
  it("offers the fourth bank first, in order, then the other banks from the back", () => {
    const slots = freeSongSlots({ 50: pad(50), 3: pad(3) });
    expect(slots.slice(0, 3)).toEqual([48, 49, 51]);
    expect(slots).toHaveLength(62);
    expect(slots.indexOf(32)).toBe(slots.indexOf(63) + 1);
    expect(slots).not.toContain(3);
  });
});

describe("makeSectionPads", () => {
  // 120 BPM, 4/4, 48 kHz: 8 bars = 768000 frames
  const grid = { bpm: 120, beatsPerBar: 4, downbeatFrame: 0, sampleRate: 48000 };
  const song = pad(0, 768000 * 2 + 100000);

  it("makes one pad per section on the free slots, each exactly 8 bars", () => {
    const { pads, dropped, seconds } = makeSectionPads(song, grid, [48, 49, 50, 51]);
    expect(pads.map((p) => p.index)).toEqual([48, 49, 50]);
    expect(pads.every((p) => p.channelData[0].length === 768000)).toBe(true);
    expect(pads.map((p) => p.section!.number)).toEqual([1, 2, 3]);
    expect(pads[0].section).toMatchObject({ bpm: 120, beatsPerBar: 4, sourceSampleId: 7 });
    expect(dropped).toBe(0);
    expect(seconds).toBe(16);
    // they are not real pads' tune state
    expect(pads.every((p) => !p.tune)).toBe(true);
  });

  it("drops the sections that do not fit", () => {
    const { pads, dropped } = makeSectionPads(song, grid, [48, 49]);
    expect(pads).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it("carries a short section's bars and cuts its audio to that length", () => {
    const g = { ...grid, bars: { 1: 3 } };
    const { pads } = makeSectionPads(pad(0, 768000 + 3 * 96000 + 768000), g, [48, 49, 50, 51]);
    expect(pads.map((p) => p.section!.bars)).toEqual([8, 3, 8]);
    expect(pads.map((p) => p.channelData[0].length)).toEqual([768000, 3 * 96000, 768000]);
  });

  it("classifies the sections as vocals and remembers the song's title for their labels", () => {
    const { pads } = makeSectionPads(pad(0, 768000 * 2), grid, [48, 49], "Toxic");
    expect(pads.every((p) => p.category === "vox")).toBe(true);
    expect(pads.map((p) => p.section!.title)).toEqual(["Toxic", "Toxic"]);
  });
});
