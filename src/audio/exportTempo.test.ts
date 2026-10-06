import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";

async function load(file: string): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL(`../../docs/calibration/${file}`, import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: Number(p.pad), sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: file, pads, padBase: 0 };
}

describe("the project tempo in the export", () => {
  it("writes the project BPM and a stretched loop's length in beats", async () => {
    const project = await load("probe-sidechain.koala");
    const target = project.samplerJson.pads.find((p: any) => p.type === "sample");
    const other = project.samplerJson.pads.find((p: any) => p.type === "sample" && p.sampleId !== target.sampleId);
    const { blob } = await buildTunedKoala(project, [], { bpm: 93, stretch: new Map([[target.sampleId, 16]]) });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sampler = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const sequence = JSON.parse(await zip.file("sequence.json")!.async("string"));
    expect(sequence.bpm).toBe(93);
    const written = sampler.pads.find((p: any) => p.sampleId === target.sampleId);
    expect([true, "true"]).toContain(written.stretching);
    expect(written.stretchLength).toBe(16);
    if (other) expect(sampler.pads.find((p: any) => p.sampleId === other.sampleId).stretchLength).toBe(other.stretchLength);
  });
});
