import { beforeEach, describe, expect, it, vi } from "vitest";
const detect = vi.hoisted(() => vi.fn());
vi.mock("../../workers/workerClient", () => ({ nextAnalysisWorker: () => ({ detectMusicTempo: detect }) }));
import { detectSongTempo } from "./detectors";

beforeEach(() => { detect.mockReset(); detect.mockResolvedValue({ bpm: 127.5, downbeatSeconds: 0.31 }); });
describe("anchored Music Tempo analysis", () => {
  it("analyzes the full song before an anchor is supplied", async () => {
    const audio = new Float32Array(44100 * 5);
    expect(await detectSongTempo(audio, 44100)).toEqual({ bpm: 127.5, downbeatSeconds: 0.31 });
    expect(detect.mock.calls[0][0].length).toBe(audio.length);
  });
  it("analyzes only audio after the anchor and keeps that exact absolute phase", async () => {
    const audio = Float32Array.from({ length: 44100 * 6 }, (_, i) => i / 1000000);
    const anchor = 44100 + 123;
    const result = await detectSongTempo(audio, 44100, anchor);
    expect(result).toEqual({ bpm: 127.5, downbeatSeconds: anchor / 44100 });
    const input = detect.mock.calls[0][0];
    expect(input.length).toBe(audio.length - anchor);
    expect(input[0]).toBe(audio[anchor]);
    expect(audio.length).toBe(44100 * 6);
  });
  it("rejects a short tail rather than silently detecting elsewhere", async () => {
    await expect(detectSongTempo(new Float32Array(44100 * 5), 44100, 44100 * 4)).rejects.toThrow();
    expect(detect).not.toHaveBeenCalled();
  });
});
