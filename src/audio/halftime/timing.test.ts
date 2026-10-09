import { describe, expect, it } from "vitest";
import { DEFAULT_RESYNC_STEPS, playbackSegments, resyncPoints, sourcePosition, type HalftimeSettings } from "./timing";
const settings: HalftimeSettings = { bpm: 120, anchorSeconds: 0, speed: 0.5, mix: 1, rhythm: true, stepBeats: 0.25, steps: DEFAULT_RESYNC_STEPS };
describe("Halftime resync timing", () => {
  it("repeats the rhythm while advancing source positions through the song", () => {
    expect(resyncPoints(settings, 0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    const segments = playbackSegments(settings, 0, 6);
    expect(segments.map(s => s.start)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sourcePosition(4, 0.8, 0.5)).toBe(4.4);
    expect(segments[5].start).toBe(5);
  });
  it("disabled steps sustain playback and an empty pattern never forces a boundary trigger", () => {
    const empty = { ...settings, steps: Array(16).fill(false) };
    expect(resyncPoints(empty, 0, 8)).toEqual([]);
    expect(playbackSegments(empty, 0, 8)).toEqual([{ start: 0, end: 8 }]);
  });
  it("does not force step one on, even at pattern boundaries", () => {
    expect(resyncPoints({ ...settings, steps: Array.from({ length: 16 }, (_, i) => i === 4) }, 0, 5)).toEqual([0.5, 2.5, 4.5]);
  });
  it("supports triplets and freely chosen step lengths", () => {
    const triplet = { ...settings, stepBeats: 1 / 3, steps: Array(16).fill(true) };
    const points = resyncPoints(triplet, 0, 4);
    expect(points).toHaveLength(24);
    expect(points[16]).toBeCloseTo(8 / 3, 10);
  });
  it("extends the pattern backward from an anchor and preserves it when BPM changes", () => {
    expect(resyncPoints({ ...settings, anchorSeconds: 3.1 }, 0, 5)).toEqual([0.10000000000000009, 1.1, 2.1, 3.1, 4.1]);
    const changed = resyncPoints({ ...settings, bpm: 90, anchorSeconds: 3.1 }, 0, 6);
    expect(changed).toContain(3.1);
  });
  it("starts a mid-song audition there without looping back to the source beginning", () => {
    expect(playbackSegments(settings, 3.2, 6)).toEqual([{ start: 3.2, end: 4 }, { start: 4, end: 5 }, { start: 5, end: 6 }]);
  });
  it("classic mode resyncs every half note regardless of hidden rhythm steps", () => {
    expect(resyncPoints({ ...settings, rhythm: false, steps: [] }, 0, 4)).toEqual([0, 1, 2, 3]);
  });
  it("pitch/duration speed never affects the normal-speed reference clock", () => {
    for (const speed of [0.25, 1 / 3, 2 / 3, 1]) expect(resyncPoints({ ...settings, speed }, 0, 4)).toEqual([0, 1, 2, 3]);
  });
});
