import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import { CHOPPER_MAX_SLICES, fitPlans, sliceLayout, sliceVelocity } from "./exportChopper";
import type { ParsedKoalaProject } from "./koalaProject";
import type { SectionPlan } from "./song/chop";

async function load(file: string): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL(`../../docs/calibration/${file}`, import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: Number(p.pad), sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: file, pads, padBase: 0 };
}

const plan = (start: number, length: number, index: number, bars = 2): SectionPlan => ({ start, length, bars, audioFrames: length, index });

describe("sliceLayout", () => {
  it("starts with slice 0 at the beginning and adds a slice where the last section ends", () => {
    const layout = sliceLayout([plan(1000, 500, 0), plan(1500, 500, 1)], 5000);
    expect(layout.starts).toEqual([0, 1000, 1500, 2000]);
    expect(layout.sections.map((s) => s.slice)).toEqual([1, 2]);
  });
  it("uses slice 0 for a first section at the start and adds no end slice when the song ends there", () => {
    const layout = sliceLayout([plan(0, 500, 0), plan(500, 500, 1)], 1000);
    expect(layout.starts).toEqual([0, 500]);
    expect(layout.sections.map((s) => s.slice)).toEqual([0, 1]);
  });
  it("keeps to 127 slices", () => {
    const plans = Array.from({ length: 200 }, (_, i) => plan(i * 100, 100, i));
    const fit = fitPlans(plans, 20000);
    expect(sliceLayout(fit, 20000).starts.length).toBeLessThanOrEqual(CHOPPER_MAX_SLICES);
    expect(fit.length).toBeGreaterThan(120);
  });
});

describe("sliceVelocity", () => {
  it("is slice + 1 with 127 slices, and spread over 1 to 127 with fewer", () => {
    expect(sliceVelocity(0, 127)).toBe(1);
    expect(sliceVelocity(126, 127)).toBe(127);
    const v = Array.from({ length: 10 }, (_, i) => sliceVelocity(i, 10));
    expect(v).toEqual([...v].sort((a, b) => a - b));
    expect(new Set(v).size).toBe(10);
    expect(v[0]).toBeGreaterThan(0);
    expect(v[9]).toBeLessThanOrEqual(127);
  });
});

describe("the chopper in the export", () => {
  it("writes one chopper pad that shares the song's sample, with the slices and the settings", async () => {
    const project = await load("probe-sidechain.koala");
    const source = project.samplerJson.pads[0];
    const layout = sliceLayout([plan(0, 1000, 0), plan(1000, 1000, 1)], 2000);
    const { blob } = await buildTunedKoala(project, [], {
      bpm: 120,
      chopper: { index: 48, label: "Song chopper", sampleId: source.sampleId, sampleRate: 44100, channelData: [new Float32Array(2000)], layout, beatsPerBar: 4, pitch: 2, bus: 3 },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sampler = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const pad = sampler.pads.find((p: any) => p.synth === "CHOPPER");
    expect(Number(pad.pad)).toBe(48);
    expect(pad.type).toBe("synth");
    expect(pad.sampleId).toBe(source.sampleId);
    expect(pad.chops.slices.map((s: any) => s.start)).toEqual([0, 1000]);
    expect(pad.synthParams).toMatchObject({ MONO: 1, "ONE SHOT": 1, "PLAY THRU": 0, synth: "slicer" });
    expect(pad.synthParams.padParams).toMatchObject({ bus: 3, pitch: 2, label: "Song chopper" });
    // the song's file is shared, not written twice
    expect(sampler.pads.filter((p: any) => p.sampleId === source.sampleId).length).toBeGreaterThanOrEqual(2);
    const sequence = JSON.parse(await zip.file("sequence.json")!.async("string"));
    const held = sequence.sequences.filter((s: any) => s.noteSequence.pattern.notes?.some((n: any) => n.num === 48));
    expect(held).toHaveLength(2);
    expect(held.map((s: any) => s.noteSequence.pattern.notes[0].vel)).toEqual([sliceVelocity(0, 2), sliceVelocity(1, 2)]);
    expect(sequence.bpm).toBe(120);
  });

  it("writes the song's file again when the export no longer has it", async () => {
    const project = await load("probe-sidechain.koala");
    const layout = sliceLayout([plan(0, 100, 0)], 100);
    const { blob } = await buildTunedKoala(project, [], { chopper: { index: 49, label: "X", sampleId: 9999, sampleRate: 44100, channelData: [new Float32Array(100)], layout, beatsPerBar: 4, pitch: 0 } });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("sampler/9999.wav")).not.toBeNull();
  });
});
