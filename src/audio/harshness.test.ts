import { describe, expect, it } from "vitest";
import { balanceFromStats, balanceStats, FILE_CEILING_DB, measureLoudness, peakOf } from "./loudness";

const SR = 44100;
const tone = (hz: number, seconds = 1, amp = 0.5) => [Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR))];

describe("harshness weighting", () => {
  it("leaves plain K-weighted loudness alone when it is not asked for", () => {
    const sound = tone(1000);
    expect(balanceStats({ channelData: sound, sampleRate: SR }).loud).toBeCloseTo(measureLoudness(sound, SR)!, 10);
  });
  it("makes a tone at 3.5 kHz and one at 8 kHz read louder than the same tone without it, and barely changes a low tone", () => {
    for (const hz of [3500, 8000]) {
      const plain = measureLoudness(tone(hz), SR)!;
      const weighted = measureLoudness(tone(hz), SR, true)!;
      expect(weighted - plain, `${hz} Hz`).toBeGreaterThan(1.5);
    }
    expect(Math.abs(measureLoudness(tone(100), SR, true)! - measureLoudness(tone(100), SR)!)).toBeLessThan(0.3);
  });
  it("takes more gain off a harsh sound than a smooth one at the same peak, so they sit at the same weighted loudness", () => {
    const smooth = tone(400);
    const harsh = tone(3500);
    const stats = [smooth, harsh].map((channelData) => balanceStats({ channelData, sampleRate: SR, category: "perc", harsh: true }));
    const { gainDb, knobDb } = balanceFromStats(stats, FILE_CEILING_DB);
    expect(peakOf(smooth)).toBeCloseTo(peakOf(harsh), 2);
    expect(knobDb[1]).toBeLessThan(knobDb[0]);
    expect(stats[0].loud! + gainDb[0] + knobDb[0]).toBeCloseTo(stats[1].loud! + gainDb[1] + knobDb[1], 6);
  });
});
