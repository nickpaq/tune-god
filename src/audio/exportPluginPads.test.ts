import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";

describe("AUv3 pads in a rearranged export", () => {
  it("moves them to the melodic banks without colliding with sounds", async () => {
    const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/calibration/calibration.koala", import.meta.url)));
    const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const pads = samplerJson.pads.map((p: any) => ({ pad: p.pad, sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
    const plugin = { pad: 40, type: "auv3", label: "Synth" };
    samplerJson.pads.push(plugin, { pad: 5, type: "auv3", label: "Keys" });
    const project: ParsedKoalaProject = { zip, samplerJson, originalName: "x.koala", pads, padBase: 0 };
    // Every sound moves onto bank C, including slot 40, which the first plugin pad holds.
    const arrangement = new Map<number, number | null>(pads.map((p: any, i: number) => [p.pad, 32 + i] as [number, number | null]));
    const { blob } = await buildTunedKoala(project, [], { arrangement });
    const json = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("sampler/sampler.json")!.async("string"));
    const numbers = json.pads.map((p: any) => p.pad);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const p of json.pads.filter((p: any) => p.type === "auv3")) expect(p.pad).toBeGreaterThanOrEqual(32);
  });
});
