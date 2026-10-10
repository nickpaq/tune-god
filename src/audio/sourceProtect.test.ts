import { describe, expect, it } from "vitest";
import { copyProblem, protectedCopy } from "./sourceProtect";

const audio = () => ({ sampleRate: 44100, channelData: [Float32Array.from({ length: 10000 }, (_, i) => Math.sin(i / 7)), Float32Array.from({ length: 10000 }, (_, i) => Math.cos(i / 9))] });

describe("source protection", () => {
  it("copies into new buffers that match, and survive the original being overwritten", () => {
    const original = audio();
    const copy = protectedCopy(original);
    expect(copy.channelData[0]).not.toBe(original.channelData[0]);
    expect(copyProblem(original, copy)).toBeNull();
    const before = copy.channelData[0][1234];
    original.channelData[0].fill(0);
    expect(copy.channelData[0][1234]).toBe(before);
  });
  it("rejects a copy that shares a buffer, is short, or differs", () => {
    const original = audio();
    expect(copyProblem(original, original)).toMatch(/shares/);
    expect(copyProblem(original, { ...protectedCopy(original), channelData: [original.channelData[0].slice(0, 5000), original.channelData[1].slice()] })).toMatch(/length/);
    const bad = protectedCopy(original);
    bad.channelData[1][9999] = 5;
    expect(copyProblem(original, bad)).toMatch(/differs/);
    expect(copyProblem(original, { sampleRate: 48000, channelData: protectedCopy(original).channelData })).toMatch(/rate/);
  });
});
