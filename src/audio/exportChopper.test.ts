import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import { CHOPPER_MAX_SLICES, fitPlans, sliceLayout, sliceOfVelocity, sliceVelocity } from "./exportChopper";
import type { ParsedKoalaProject } from "./koalaProject";
import { packArrangement } from "./song/sectionWorkspace";
import type { MakerChop } from "./song/patternMaker";
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
  it("plays its own slice for every slice count, by the rule measured in Koala (velocity x count / 128)", () => {
    for (let count = 1; count <= 127; count++) for (let slice = 0; slice < count; slice++) expect(sliceOfVelocity(sliceVelocity(slice, count), count)).toBe(slice);
  });
  it("matches the render of the probe: with 16 slices velocities 1 + 8i and 4 + 8i both play slice i", () => {
    for (let i = 0; i < 16; i++) {
      expect(sliceOfVelocity(1 + 8 * i, 16)).toBe(i);
      expect(sliceOfVelocity(4 + 8 * i, 16)).toBe(i);
      expect(sliceVelocity(i, 16)).toBe(3 + 8 * i);
    }
    expect(sliceOfVelocity(127, 16)).toBe(15);
  });
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
    expect(pad.synthParams).toMatchObject({ MONO: 1, "ONE SHOT": 1, "PLAY THRU": 0, "TRIGGER MODE": 1, synth: "slicer" });
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

  it("writes the pattern maker's sequence as ONE pattern with a note per chop at its place, and lets the note length decide when a chop is cut short", async () => {
    const project = await load("probe-sidechain.koala");
    const source = project.samplerJson.pads[0];
    const layout = sliceLayout([plan(0, 1000, 0), plan(1000, 1000, 1)], 2000);
    const pattern = { notes: [{ slice: 1, start: 0, steps: 8 }, { slice: 0, start: 12, steps: 3 }], bars: 2, gate: true };
    const { blob } = await buildTunedKoala(project, [], {
      chopper: { index: 48, label: "Song chopper", sampleId: source.sampleId, sampleRate: 44100, channelData: [new Float32Array(2000)], layout, beatsPerBar: 4, pitch: 0, pattern },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sampler = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    expect(sampler.pads.find((p: any) => p.synth === "CHOPPER").synthParams["ONE SHOT"]).toBe(0);
    const sequence = JSON.parse(await zip.file("sequence.json")!.async("string"));
    const held = sequence.sequences.filter((s: any) => s.noteSequence.pattern.notes?.some((n: any) => n.num === 48));
    expect(held).toHaveLength(1);
    const made = held[0].noteSequence.pattern;
    expect(made.numBars).toBe(2);
    // 1024 ticks to a step
    expect(made.notes.map((n: any) => [n.timeOffset, n.length, n.vel])).toEqual([
      [0, 8 * 1024, sliceVelocity(1, 2)],
      [12 * 1024, 3 * 1024, sliceVelocity(0, 2)],
    ]);
  });
  it("writes overlapping arrangement pieces into a new sample without altering the existing Koala source", async () => {
    const project = await load("probe-sidechain.koala");
    const sourceId = project.samplerJson.pads[0].sampleId;
    const original = await project.zip.file(`sampler/${sourceId}.wav`)!.async("uint8array");
    const data = [Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i * 0.04))];
    const chop: MakerChop = { slice: 0, start: 0, length: 2000, steps: 16, bars: 1, barIndex: 0, colorIndex: 0, color: "#fff" };
    const packed = packArrangement(data, [chop, { ...chop, start: 1000 }], [{ kind: "chop", chop: 0, steps: 16 }, { kind: "silence", steps: 4 }, { kind: "chop", chop: 1, steps: 8 }], 500, 1000);
    const { blob } = await buildTunedKoala(project, [], {
      chopper: { index: 48, label: "Pattern", sampleId: sourceId, independentSample: true, sampleRate: 1000, channelData: packed.channelData, layout: packed.layout, beatsPerBar: 4, pitch: 0, pattern: { notes: packed.notes, bars: 2, gate: true } },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sampler = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const pad = sampler.pads.find((p: any) => p.synth === "CHOPPER");
    expect(pad.sampleId).not.toBe(sourceId);
    expect(pad.chops.slices.map((s: any) => s.start)).toEqual([0, 2000]);
    expect(zip.file(`sampler/${pad.sampleId}.wav`)).not.toBeNull();
    expect(await zip.file(`sampler/${sourceId}.wav`)!.async("uint8array")).toEqual(original);
    const sequence = JSON.parse(await zip.file("sequence.json")!.async("string"));
    const notes = sequence.sequences.flatMap((s: any) => (s.noteSequence?.pattern?.notes ?? [])).filter((n: any) => n?.num === 48);
    expect(notes.map((n: any) => [n.timeOffset, n.length, n.vel])).toEqual([[0, 16384, sliceVelocity(0, 2)], [20480, 8192, sliceVelocity(1, 2)]]);
  });

  it("exports triplet 64th notes on integer ticks without accumulating timing drift", async () => {
    const project = await load("probe-sidechain.koala");
    const sourceId = project.samplerJson.pads[0].sampleId;
    const notes = Array.from({ length: 96 }, (_, i) => ({ slice: 0, start: i / 6, steps: 1 / 6 }));
    const { blob } = await buildTunedKoala(project, [], { chopper: { index: 48, label: "Triplets", sampleId: sourceId, sampleRate: 44100, channelData: [new Float32Array(1000)], layout: { starts: [0], sections: [] }, beatsPerBar: 4, pitch: 0, pattern: { notes, bars: 1, gate: true } } });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sequence = JSON.parse(await zip.file("sequence.json")!.async("string"));
    const written = sequence.sequences.flatMap((s: any) => s.noteSequence?.pattern?.notes ?? []).filter((n: any) => n?.num === 48);
    expect(written).toHaveLength(96);
    expect(written.slice(0,3).map((n: any) => [n.timeOffset,n.length])).toEqual([[0,171],[171,170],[341,171]]);
    expect(written.at(-1).timeOffset + written.at(-1).length).toBe(16384);
  });

});
