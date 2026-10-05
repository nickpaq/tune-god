import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";
import { STRETCH_LENGTH_UNIT, stretchLengthFor, TICKS_PER_BEAT } from "./exportSong";

async function load(file: string): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL(`../../docs/calibration/${file}`, import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: Number(p.pad), sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: file, pads, padBase: 0 };
}

const section = (index: number, frames: number): { index: number; label: string; channelData: Float32Array[]; bars?: number; color?: string; bus?: number } => ({ index, label: `Section ${index - 47}`, channelData: [new Float32Array(frames).fill(0.2)] });

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
    // the section's sample keeps the stem's own metadata: no tempo is written to it
    const template = project.samplerJson.samples.find((s: any) => s.id === project.samplerJson.pads[0].sampleId);
    expect(sampler.samples.find((s: any) => s.id === added[0].sampleId).metadata.bpm).toBe(template.metadata.bpm);
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

  it("gives a short section a pattern of its own length: 3 bars of audio, a 3 bar pattern, the note held 3 bars", async () => {
    const { sequence, before } = await run("probe-sidechain.koala", [{ ...section(48, 100), bars: 8 }, { ...section(49, 60), bars: 3 }, { ...section(50, 100), bars: 8 }]);
    const firstFree = before.sequences.findIndex((s: any) => !s.noteSequence.pattern.notes?.length);
    const patterns = [0, 1, 2].map((i) => sequence.sequences[firstFree + i].noteSequence.pattern);
    expect(patterns.map((p: any) => p.numBars)).toEqual([8, 3, 8]);
    expect(patterns.map((p: any) => p.notes[0].length)).toEqual([8 * 4 * TICKS_PER_BEAT, 3 * 4 * TICKS_PER_BEAT, 8 * 4 * TICKS_PER_BEAT]);
    expect(patterns.map((p: any) => p.notes[0].num)).toEqual([48, 49, 50]);
  });

  it("turns stretch on for every section pad, for as many bars as its pattern, so the vocals stay in time if the tempo changes", async () => {
    const { sampler, sequence, before } = await run("probe-sidechain.koala", [{ ...section(48, 100), bars: 8 }, { ...section(49, 60), bars: 3 }, { ...section(50, 100), bars: 8 }]);
    const added = sampler.pads.filter((p: any) => /^Section/.test(p.label));
    expect(added.map((p: any) => p.stretching)).toEqual([true, true, true]);
    // the same bars as the pattern of that pad
    const firstFree = before.sequences.findIndex((s: any) => !s.noteSequence.pattern.notes?.length);
    added.forEach((pad: any, i: number) => {
      const pattern = sequence.sequences[firstFree + i].noteSequence.pattern;
      expect(pad.stretchLength).toBe(stretchLengthFor(pattern.numBars, sequence.beatsPerBar));
    });
    // Koala counts the stretch length in beats: 8 bars of 4/4 is 32, 3 bars is 12
    expect(STRETCH_LENGTH_UNIT).toBe("beats");
    expect(added.map((p: any) => p.stretchLength)).toEqual([32, 12, 32]);
    // the stretch mode is left as it was
    expect(added.every((p: any) => p.stretch === 1)).toBe(true);
  });

  it("writes stretch in the style the template pad uses (a string when it holds booleans as strings)", async () => {
    const project = await load("probe-sidechain.koala");
    project.samplerJson.pads[0].stretching = "false";
    const { blob } = await buildTunedKoala(project, [], { song: { bpm: 90, sampleRate: 44100, sourceSampleId: project.samplerJson.pads[0].sampleId, sections: [section(48, 50)], bars: 8 } });
    const out = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("sampler/sampler.json")!.async("string"));
    expect(out.pads.find((p: any) => /^Section/.test(p.label)).stretching).toBe("true");
  });
});

describe("labels, colour and bus of the sections", () => {
  it("writes the label, and the colour and bus when the app gives them (colouring and routing on)", async () => {
    const { sampler } = await run("probe-sidechain.koala", [
      { ...section(48, 50), label: "Toxic Vox 1", color: "#123456", bus: 3 },
      { ...section(49, 50), label: "Toxic Vox 2" },
    ]);
    const added = sampler.pads.filter((p: any) => /^Toxic Vox/.test(p.label));
    expect(added.map((p: any) => p.label)).toEqual(["Toxic Vox 1", "Toxic Vox 2"]);
    expect(added[0].color).toBe("#123456");
    expect(added[0].bus).toBe(3);
    // not asked: the stem pad's own colour and bus are kept
    const source = sampler.pads.find((p: any) => !/^Toxic Vox/.test(p.label));
    expect(added[1].bus).toBe(source.bus);
  });
});

describe("stretch, against a real Koala project", () => {
  it("writes what Koala wrote for a pad stretched over 5 bars in 4/4: stretching on, stretch 1, stretchLength 20 (beats)", async () => {
    const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/calibration/stretch-5-bars.koala", import.meta.url)));
    const pad = JSON.parse(await zip.file("sampler/sampler.json")!.async("string")).pads[0];
    const sequence = JSON.parse(await zip.file("sequence.json")!.async("string"));
    expect(sequence.beatsPerBar).toBe(4);
    expect(pad.stretching).toBe(true);
    expect(pad.stretch).toBe(1);
    expect(stretchLengthFor(5, sequence.beatsPerBar)).toBe(pad.stretchLength);
    expect(pad.stretchLength).toBe(20);
  });
});

describe("stretchLengthFor", () => {
  it("is the beats in the bars: 8 bars of 4/4 is 32, 3 bars of 7/4 is 21", () => {
    expect(stretchLengthFor(8, 4)).toBe(32);
    expect(stretchLengthFor(3, 7)).toBe(21);
  });
});
