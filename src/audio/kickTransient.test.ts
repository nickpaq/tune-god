import { describe, expect, it } from "vitest";
import { fadeIn, fadeMsFor, kickTransientMs, medianTransientMs } from "./kickTransient";

const SR = 48000;
/** A kick: a sine that decays with the given time constant (ms), after `lead` ms of silence. */
function kick(decayMs: number, lead = 0, lengthMs = 600): Float32Array {
  const out = new Float32Array(Math.round((lengthMs / 1000) * SR));
  const start = Math.round((lead / 1000) * SR);
  for (let i = start; i < out.length; i++) {
    const t = (i - start) / SR;
    out[i] = Math.exp(-t / (decayMs / 1000)) * Math.sin(2 * Math.PI * 55 * t);
  }
  return out;
}

describe("kickTransientMs", () => {
  it("measures how long the envelope stays within 6 dB of its peak: about ln(2) time constants", () => {
    // An exponential falls 6 dB (half amplitude) after ln(2) x tau.
    const ms = kickTransientMs([kick(80)], SR)!;
    expect(ms).toBeGreaterThan(80 * Math.LN2 * 0.7);
    expect(ms).toBeLessThan(80 * Math.LN2 * 1.4);
  });

  it("is longer for a kick that rings longer, and ignores a silent lead-in", () => {
    expect(kickTransientMs([kick(200)], SR)!).toBeGreaterThan(kickTransientMs([kick(40)], SR)!);
    expect(kickTransientMs([kick(80, 100)], SR)!).toBeCloseTo(kickTransientMs([kick(80)], SR)!, -1);
  });

  it("returns null for silence", () => expect(kickTransientMs([new Float32Array(1000)], SR)).toBeNull());
});

describe("median and fade length", () => {
  it("takes the median, skipping silent sounds", () => {
    expect(medianTransientMs([10, null, 30, 20])).toBe(20);
    expect(medianTransientMs([10, 20])).toBe(15);
    expect(medianTransientMs([null])).toBeNull();
  });

  it("holds the fade between the preset's smallest and largest", () => {
    expect(fadeMsFor(1, 4, 30)).toBe(4);
    expect(fadeMsFor(18, 4, 30)).toBe(18);
    expect(fadeMsFor(400, 4, 30)).toBe(30);
  });
});

describe("fadeIn", () => {
  it("starts at silence, reaches full level after the fade and leaves the rest and the input alone", () => {
    const input = new Float32Array(SR / 10).fill(1);
    const [out] = fadeIn([input], SR, 10);
    const frames = Math.round(0.01 * SR);
    expect(out[0]).toBe(0);
    expect(out[Math.floor(frames / 2)]).toBeCloseTo(0.5, 1);
    expect(out[frames]).toBe(1);
    expect(out[out.length - 1]).toBe(1);
    expect(input[0]).toBe(1);
    for (let i = 1; i < frames; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });
});
