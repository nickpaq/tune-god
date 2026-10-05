import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import type { SectionPlan } from "./song/chop";
import { freeSongSlots, makeSectionPads } from "./songPads";

const pad = (index: number, frames = 10): Pad => ({ index, origIndex: index, name: "song", sampleId: 7, sampleRate: 48000, channelData: [new Float32Array(frames)], tune: false, semis: 0, cents: 0 });

describe("freeSongSlots", () => {
  it("offers bank D's free pads in order and no others", () => {
    const slots = freeSongSlots({ 50: pad(50), 3: pad(3) });
    expect(slots).toHaveLength(15);
    expect(slots.slice(0, 3)).toEqual([48, 49, 51]);
    expect(slots.every((s) => s >= 48 && s < 64)).toBe(true);
  });

  it("counts a blank Empty pad placeholder as free, but not a missing kit slot", () => {
    const empty = (index: number): Pad => ({ ...pad(index), placeholder: { kind: "empty", label: "Empty pad" } });
    const missing = (index: number): Pad => ({ ...pad(index), placeholder: { kind: "missing", label: "add snare" } });
    const grid: Record<number, Pad> = {};
    for (let i = 0; i < 64; i++) grid[i] = i === 52 ? missing(i) : i === 53 ? pad(i) : empty(i);
    const slots = freeSongSlots(grid);
    expect(slots).toHaveLength(14);
    expect(slots).not.toContain(52);
    expect(slots).not.toContain(53);
    expect(slots.some((s) => s < 48)).toBe(false);
  });
});

describe("makeSectionPads", () => {
  // 120 BPM, 4/4, 48 kHz: 8 bars = 768000 frames
  const plan = (index: number, start: number, bars: number): SectionPlan => ({ index, start, length: bars * 96000, bars, audioFrames: bars * 96000 });
  const plans = [plan(0, 0, 8), plan(1, 768000, 8), plan(2, 1536000, 8)];
  const song = pad(0, 768000 * 3);

  it("makes one pad per section on the free slots, each exactly its length", () => {
    const { pads, dropped } = makeSectionPads(song, plans, 120, 4, [48, 49, 50, 51]);
    expect(pads.map((p) => p.index)).toEqual([48, 49, 50]);
    expect(pads.every((p) => p.channelData[0].length === 768000)).toBe(true);
    expect(pads.map((p) => p.section!.number)).toEqual([1, 2, 3]);
    expect(pads[0].section).toMatchObject({ bpm: 120, beatsPerBar: 4, sourceSampleId: 7 });
    expect(dropped).toBe(0);
    // they are not real pads' tune state
    expect(pads.every((p) => !p.tune)).toBe(true);
  });

  it("drops the sections that do not fit", () => {
    const { pads, dropped } = makeSectionPads(song, plans, 120, 4, [48, 49]);
    expect(pads).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it("carries a short section's bars and cuts its audio to that length", () => {
    const { pads } = makeSectionPads(pad(0, 768000 + 3 * 96000 + 768000), [plan(0, 0, 8), plan(1, 768000, 3), plan(2, 768000 + 3 * 96000, 8)], 120, 4, [48, 49, 50, 51]);
    expect(pads.map((p) => p.section!.bars)).toEqual([8, 3, 8]);
    expect(pads.map((p) => p.channelData[0].length)).toEqual([768000, 3 * 96000, 768000]);
  });

  it("classifies the sections as vocals and keeps the colour each was given, as hex", () => {
    const { pads } = makeSectionPads(song, plans.slice(0, 2), 120, 4, [48, 49], ["#111111", "#222222"]);
    expect(pads.every((p) => p.category === "vox")).toBe(true);
    expect(pads.map((p) => p.section!.color)).toEqual(plans.slice(0, 2).map((pl) => (pl.colorIndex === undefined ? undefined : ["#111111", "#222222"][pl.colorIndex % 2])));
  });
});
