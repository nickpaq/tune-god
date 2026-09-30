import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";

async function load(): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/calibration/calibration.koala", import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: p.pad, sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: "calibration.koala", pads, padBase: 0 };
}

describe("ghost pads in the export", () => {
  it("adds a pad with its own sample, cloned from the source, with the knob at 0 dB", async () => {
    const project = await load();
    const source = project.samplerJson.pads[0];
    const realCount = project.pads.length;
    const arrangement = new Map(project.pads.map((p, i) => [p.pad, 32 + i] as [number, number | null]));
    const channelData = [new Float32Array(1000).fill(0.1)];
    const { blob } = await buildTunedKoala(project, [], {
      arrangement,
      vols: new Map([[source.sampleId, 0.5]]),
      ghosts: [{ index: 9, label: "Ghost Snare", color: "#123456", sourceSampleId: source.sampleId, sampleRate: 44100, channelData }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const json = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));

    expect(json.pads).toHaveLength(realCount + 1);
    const ghost = json.pads.find((p: any) => p.label === "Ghost Snare");
    expect(ghost.pad).toBe(9);
    expect(ghost.color).toBe("#123456");
    expect(ghost.vol).toBe(1);
    if ("end" in source) expect(ghost.end).toBe(1000);
    expect(ghost.sampleId).not.toBe(source.sampleId);
    expect(json.pads.filter((p: any) => p.sampleId === ghost.sampleId)).toHaveLength(1);
    expect(json.samples.filter((s: any) => s.id === ghost.sampleId)).toHaveLength(1);
    // Its own 24-bit WAV, not a pointer to the source's file.
    const wav = await zip.file(`sampler/${ghost.sampleId}.wav`)!.async("uint8array");
    expect(wav.length).toBe(44 + 1000 * 3);
    expect(json.pads.map((p: any) => p.pad)).toEqual([...json.pads.map((p: any) => p.pad)].sort((a, b) => a - b));
  });

  it("skips a ghost whose source pad is gone", async () => {
    const project = await load();
    const { blob } = await buildTunedKoala(project, [], {
      ghosts: [{ index: 60, label: "Soft Kick", sourceSampleId: -5, sampleRate: 44100, channelData: [new Float32Array(10)] }],
    });
    const json = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("sampler/sampler.json")!.async("string"));
    expect(json.pads).toHaveLength(project.pads.length);
  });
});
