import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import { pitchKnobFor, shiftFor, snapSemitones } from "./shift";

const pad = (over: Partial<Pad>): Pad => ({ index: 0, origIndex: 0, name: "x.wav", sampleId: 1, sampleRate: 48000, channelData: [new Float32Array(1)], tune: true, semis: 0, cents: 0, ...over });

describe("shiftFor", () => {
  it("is to two decimals", () => {
    // 60.4 moves to C (60) by -0.4; a trim of 3 cents is added; the sum is exact to 0.01
    const s = shiftFor(pad({ category: "melodic", detectedMidi: 60.4137, cents: 3 }), 0, 440);
    expect(s).toBe(-0.38);
    expect(Math.round(s * 100)).toBe(s * 100 === Math.round(s * 100) ? s * 100 : Math.round(s * 100));
  });

  it("is zero with Tune off, except an 808 that has not been told to stay as it was: it sits on its nearest semitone", () => {
    expect(shiftFor(pad({ tune: false, category: "melodic", detectedMidi: 60.4 }), 0, 440)).toBe(0);
    expect(shiftFor(pad({ tune: false, category: "bass", detectedMidi: 36.3 }), null, 440)).toBe(-0.3);
    expect(shiftFor(pad({ tune: false, tuneLocked: true, category: "bass", detectedMidi: 36.3 }), null, 440)).toBe(0);
  });
});

describe("the 808's render and the pitch knob", () => {
  it("renders only bass onto the nearest semitone, to two decimals", () => {
    expect(snapSemitones(pad({ category: "bass", detectedMidi: 36.3 }))).toBe(-0.3);
    expect(snapSemitones(pad({ category: "bass", detectedMidi: 36.7 }))).toBe(0.3);
    expect(snapSemitones(pad({ category: "bass", detectedMidi: null }))).toBe(0);
    expect(snapSemitones(pad({ category: "melodic", detectedMidi: 36.3 }))).toBe(0);
  });

  it("writes the knob as the total shift less what the render already did, so audio and knob add up to the shift", () => {
    const p = pad({ category: "bass", detectedMidi: 36.3 });
    const shift = shiftFor(p, 0, 440); // target C: from 36.3 down 0.3
    expect(shift).toBe(-0.3);
    expect(pitchKnobFor(p, shift)).toBe(0);
    const q = pad({ category: "bass", detectedMidi: 36.3, semis: 2, cents: 25 });
    expect(snapSemitones(q) + pitchKnobFor(q, shiftFor(q, 0, 440))).toBeCloseTo(shiftFor(q, 0, 440), 10);
  });

  it("a pad that is not rendered gets the whole shift on the knob", () => {
    const p = pad({ category: "melodic", detectedMidi: 62.25 });
    expect(pitchKnobFor(p, shiftFor(p, 0, 440))).toBe(-2.25);
  });
});
