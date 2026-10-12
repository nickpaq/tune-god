import { describe, expect, it } from "vitest";
import { suggestedSongIndex } from "./acapellaRoles";
const audio = (pulsed: boolean, gain = 1) => ({ sampleRate: 1000, channelData: [Float32Array.from({ length: 10000 }, (_, i) => gain * Math.sin(i * .5) * (pulsed ? (i % 500 < 40 ? 1 : .01) : .2))] });
describe("acapella role suggestions", () => {
  it("suggests the stronger transient mix regardless of file order or overall gain", () => {
    expect(suggestedSongIndex([audio(false), audio(true, .05)])).toBe(1);
    expect(suggestedSongIndex([audio(true), audio(false)])).toBe(0);
  });
  it("leaves similarly percussive files and silence ambiguous", () => {
    expect(suggestedSongIndex([audio(true), audio(true, .1)])).toBeNull();
    expect(suggestedSongIndex([audio(false, 0), audio(false, 0)])).toBeNull();
  });
});
