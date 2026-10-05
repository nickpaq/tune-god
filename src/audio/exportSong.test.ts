import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";
import { TICKS_PER_BEAT } from "./exportSong";

async function load(file: string): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL(`../../docs/calibration/${file}`, import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: Number(p.pad), sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: file, pads, padBase: 0 };
}

const section = (index: number, frames: number) => ({ index, label: `Section ${index - 47}`, channelData: [new Float32Array(frames).fill(0.2)] });

async function run(file: string, sections: ReturnType<typeof section>[], bpm = 75) {
  const project = await load(file);
  const source = project.samplerJson.pads[0];
  const before = JSON.parse(await project.zip.file("sequence.json")!.async("string"));
  const { blob } = await buildTunedKoala(project, [], { song: { bpm, sampleRate: 44100, sourceSampleId: source.sampleId, sections, bars: 8 } });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    zip,
    sampler: JSON.parse(await zip.file("sampler/sampler.json")!.async("string")),
    sequence: JSON.parse(await zip.file("sequence.json")!.async("string")),
    before,
    project,
  };
}

describe("a chopped song in the export", () => {
  it("adds one pad per section: its own file, one-shot, all in the same choke group", async () => {
    const { zip, sampler, project } = await run("probe-sidechain.koala", [section(48, 1000), section(49, 1000), section(50, 600)]);
    const added = sampler.pads.filter((p: any) => /^Section/.test(p.label));
    expect(added.map((p: any) => Number(p.pad))).toEqual([48, 49, 50]);
    expect(new Set(added.map((p: any) => p.sampleId)).size).toBe(3);
    expect(new Set(added.map((p: any) => p.chokeGroup)).size).toBe(1);
    expect(added[0].chokeGroup).toBeGreaterThan(0);
    // the choke group is one no other pad uses
    const others = sampler.pads.filter((p: any) => !/^Section/.test(p.label)).map((p: any) => p.chokeGroup);
    expect(others).not.toContain(added[0].chokeGroup);
    for (const p of added) {
      expect(String(p.oneshot)).toBe("true");
      expect(String(p.looping)).toBe("false");
      expect(p.start).toBe(0);
    }
    expect(added[2].end).toBe(600);
    expect(sampler.pads).toHaveLength(project.pads.length + 3);
    // 24-bit file of exactly that many frames
    const wav = await zip.file(`sampler/${added[2].sampleId}.wav`)!.async("uint8array");
    expect(wav.length).toBe(44 + 600 * 3);
    expect(sampler.samples.find((s: any) => s.id === added[0].sampleId).metadata.bpm).toBe(75);
  });

  it("writes one pattern per section: that pad held for the whole 8 bars, and the song's tempo", async () => {
    const { sequence, before } = await run("probe-sidechain.koala", [section(48, 100), section(49, 100)]);
    expect(sequence.bpm).toBe(75);
    expect(sequence.autoPlay).toBe("next");
    const firstFree = before.sequences.findIndex((s: any) => !s.noteSequence.pattern.notes?.length);
    for (const [i, pad] of [48, 49].entries()) {
      const pattern = sequence.sequences[firstFree + i].noteSequence.pattern;
      expect(pattern.numBars).toBe(8);
      expect(pattern.notes).toHaveLength(1);
      expect(pattern.notes[0]).toMatchObject({ num: pad, timeOffset: 0, length: 8 * sequence.beatsPerBar * TICKS_PER_BEAT, vel: 127 });
    }
    expect(sequence.currSequenceId).toBe(firstFree);
    // patterns that were already recorded are untouched
    for (let i = 0; i < firstFree; i++) expect(sequence.sequences[i]).toEqual(before.sequences[i]);
  });

  it("holds each note for 8 bars of the project's own time signature (3/4 = 24 beats)", async () => {
    const project = await load("probe-sidechain.koala");
    const seq = JSON.parse(await project.zip.file("sequence.json")!.async("string"));
    seq.beatsPerBar = 3;
    project.zip.file("sequence.json", JSON.stringify(seq));
    const { blob } = await buildTunedKoala(project, [], { song: { bpm: 90, sampleRate: 44100, sourceSampleId: project.samplerJson.pads[0].sampleId, sections: [section(48, 50)], bars: 8 } });
    const out = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("sequence.json")!.async("string"));
    const note = out.sequences.find((s: any) => s.noteSequence.pattern.notes?.some((n: any) => n.num === 48)).noteSequence.pattern.notes[0];
    expect(note.length).toBe(24 * TICKS_PER_BEAT);
    expect(out.beatsPerBar).toBe(3);
  });

  it("drops sections that do not fit: a slot that is taken, or no pattern left", async () => {
    const project = await load("probe-sidechain.koala");
    const first = project.samplerJson.pads[0];
    const before = JSON.parse(await project.zip.file("sequence.json")!.async("string"));
    const freeBefore = before.sequences.filter((s: any) => !s.noteSequence.pattern.notes?.length).length;
    const { blob } = await buildTunedKoala(project, [], {
      song: { bpm: 100, sampleRate: 44100, sourceSampleId: first.sampleId, sections: [section(Number(first.pad), 10), ...Array.from({ length: 40 }, (_, i) => section(10 + i, 10))], bars: 8 },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sampler = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const sequence = JSON.parse(await zip.file("sequence.json")!.async("string"));
    const added = sampler.pads.filter((p: any) => /^Section/.test(p.label));
    // as many sections as there were free patterns, and none on the pad that was already taken
    expect(added).toHaveLength(freeBefore);
    expect(added.map((p: any) => Number(p.pad))).not.toContain(Number(first.pad));
    expect(sequence.sequences).toHaveLength(32);
    expect(sequence.sequences.filter((s: any) => s.noteSequence.pattern.notes?.length)).toHaveLength(32);
  });
});
