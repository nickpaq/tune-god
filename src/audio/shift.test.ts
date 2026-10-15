import { describe, expect, it } from "vitest";
import type { Pad } from "../components/PadPanel";
import { shiftFor, snapSemitones } from "./shift";

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

describe("the 808's pitch is on the knob, never rendered", () => {
  it("moves only bass onto the nearest semitone, to two decimals", () => {
    expect(snapSemitones(pad({ category: "bass", detectedMidi: 36.3 }))).toBe(-0.3);
    expect(snapSemitones(pad({ category: "bass", detectedMidi: 36.7 }))).toBe(0.3);
    expect(snapSemitones(pad({ category: "bass", detectedMidi: null }))).toBe(0);
    expect(snapSemitones(pad({ category: "melodic", detectedMidi: 36.3 }))).toBe(0);
  });

  it("the knob carries the whole shift of an 808, snap and retune together", () => {
    const p = pad({ category: "bass", detectedMidi: 36.3, tune: false });
    expect(shiftFor(p, 0, 440)).toBe(-0.3); // Tune off: onto its nearest semitone
    const q = pad({ category: "bass", detectedMidi: 36.3, semis: 2, cents: 25 });
    expect(shiftFor(q, 0, 440)).toBe(1.95); // C from 36.3 is -0.3, plus 2 semitones and 25 cents
  });
});

describe("a chop section's pitch", () => {
  const section = (key: { pc: number; minor: boolean } | null | undefined, extra: Partial<Pad> = {}) =>
    pad({ tune: false, category: "vox", section: { number: 1, sourceSampleId: 1, bpm: 100, beatsPerBar: 4, bars: 1, pitch: 2, key }, ...extra });
  it("follows the key picked on the piano live: the key move plus the manual trim, once", () => {
    const a = { pc: 9, minor: true };
    expect(shiftFor(section(a), 0, 440)).toBe(3); // A minor to C minor
    expect(shiftFor(section(a), 2, 440)).toBe(5);
    expect(shiftFor(section(a, { semis: 1, cents: 25 }), 2, 440)).toBe(6.25);
    expect(shiftFor(section(a), null, 440)).toBe(0);
    expect(shiftFor(section(null), 0, 440)).toBe(0);
  });
  it("keeps the stored move for a chop made before the key was kept", () => {
    expect(shiftFor(section(undefined), null, 440)).toBe(2);
  });
});
