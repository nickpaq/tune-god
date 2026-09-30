import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";
import { EMPTY_PAD_COLOR, MISSING_PAD_COLOR, PLACEHOLDER_FRAMES } from "./placeholderPads";

// JSZip can't read Node's File, so the project is assembled from the bytes the way parseKoalaProject does.
async function load(): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/calibration/calibration.koala", import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: p.pad, sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: "calibration.koala", pads, padBase: 0 };
}

describe("placeholder pads in the export", () => {
  it("adds labelled, coloured silent pads that share one 2 ms silent sample", async () => {
    const project = await load();
    const realCount = project.pads.length;
    // Move every real pad to bank C and fill the rest of bank A with placeholders.
    const arrangement = new Map(project.pads.map((p, i) => [p.pad, 32 + i] as [number, number | null]));
    const placeholders = [
      { index: 0, label: "missing Kick", color: MISSING_PAD_COLOR },
      { index: 1, label: "Empty pad", color: EMPTY_PAD_COLOR },
    ];
    const { blob } = await buildTunedKoala(project, [], { arrangement, placeholders });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const json = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));

    expect(json.pads).toHaveLength(realCount + 2);
    const added = json.pads.filter((p: any) => p.label);
    expect(added.map((p: any) => [p.pad, p.label, p.color])).toEqual([
      [0, "missing Kick", MISSING_PAD_COLOR],
      [1, "Empty pad", EMPTY_PAD_COLOR],
    ]);
    // Real pads moved to bank C, placeholders sit in front, and the pad list stays in slot order.
    expect(json.pads.map((p: any) => p.pad)).toEqual([0, 1, ...Array.from({ length: realCount }, (_, i) => 32 + i)]);

    const silentId = added[0].sampleId;
    expect(added[1].sampleId).toBe(silentId);
    expect(json.pads.filter((p: any) => p.sampleId === silentId)).toHaveLength(2);
    expect(json.samples.filter((s: any) => s.id === silentId)).toHaveLength(1);
    const wav = await zip.file(`sampler/${silentId}.wav`)!.async("uint8array");
    expect(wav.length).toBe(44 + PLACEHOLDER_FRAMES * 2);
    expect(wav.slice(44).every((b) => b === 0)).toBe(true);
  });
});

describe("sequences with a layout applied", () => {
  it("moves recorded notes with their pads and leaves the placeholders out of them", async () => {
    const project = await load();
    project.zip.file(
      "sequence.json",
      JSON.stringify({ sequences: [{ noteSequence: { pattern: { notes: [{ num: 0 }, { num: 3 }, { num: 3 }] } } }] }),
    );
    const arrangement = new Map(project.pads.map((p) => [p.pad, 40 - p.pad] as [number, number | null]));
    const { blob } = await buildTunedKoala(project, [], {
      arrangement,
      placeholders: [{ index: 0, label: "Empty pad", color: EMPTY_PAD_COLOR }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const seq = JSON.parse(await zip.file("sequence.json")!.async("string"));
    expect(seq.sequences[0].noteSequence.pattern.notes.map((n: any) => n.num)).toEqual([40, 37, 37]);
  });
});
