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

// A project saved by Koala itself: pad 0 is "top left bank A", 15 "bottom right bank A", 63 "bottom right bank D".
describe("a real Koala project", () => {
  async function loadReal(): Promise<ParsedKoalaProject> {
    const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/fixtures/pad-numbering.koala", import.meta.url)));
    const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const pads = samplerJson.pads.map((p: any) => ({ pad: Number(p.pad), sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
    return { zip, samplerJson, originalName: "pad-numbering.koala", pads, padBase: 0 };
  }

  it("numbers pads from 0, row by row from the top left, matching the app's slots", async () => {
    const project = await loadReal();
    expect(project.pads.map((p) => p.pad)).toEqual([0, 15, 63]);
    expect(project.samplerJson.pads.map((p: any) => p.label)).toEqual(["top left bank A", "bottom right bank A", "bottom right bank d"]);
  });

  it("writes placeholder pads with every field Koala's own pads carry, and string pad numbers", async () => {
    const project = await loadReal();
    const arrangement = new Map<number, number | null>([[0, 32], [15, 33], [63, 34]]);
    const { blob } = await buildTunedKoala(project, [], {
      arrangement,
      placeholders: [{ index: 12, label: "missing Kick", color: MISSING_PAD_COLOR }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const json = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const added = json.pads.find((p: any) => p.label === "missing Kick");
    const original = json.pads.find((p: any) => p.label === "top left bank A");
    expect(added.pad).toBe("12");
    expect(original.pad).toBe("32");
    // Same fields as a Koala pad, plus the colour these pads are given.
    expect(Object.keys(added).sort()).toEqual([...Object.keys(original), "color"].sort());
    expect(added.end).toBe(PLACEHOLDER_FRAMES);
    expect(added.zoomEnd).toBe(PLACEHOLDER_FRAMES);
    const sample = json.samples.find((s: any) => s.id === added.sampleId);
    expect(Object.keys(sample.metadata).sort()).toEqual(Object.keys(json.samples[0].metadata).sort());
    // Koala writes null for a sequence with no notes; the remap must cope.
    expect(JSON.parse(await zip.file("sequence.json")!.async("string")).sequences[0].noteSequence.pattern.notes).toBeNull();
    expect(JSON.parse(await zip.file("song.json")!.async("string")).selectedPad).toBe(34);
  });
});
