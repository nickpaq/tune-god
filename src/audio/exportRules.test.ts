import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";
import { balanceFromStats, FILE_CEILING_DB } from "./loudness";
import { ACTIVE_MIX_PRESET } from "./mixPresets";
import { playbackFor, STRETCH_MODE } from "./padSettings";

async function load(): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/calibration/calibration.koala", import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: p.pad, sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: "calibration.koala", pads, padBase: 0 };
}

const sampler = async (project: ParsedKoalaProject, options: Parameters<typeof buildTunedKoala>[2]) => {
  const { blob } = await buildTunedKoala(project, [], options);
  return JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("sampler/sampler.json")!.async("string"));
};

describe("every tuning goes to the pitch knob", () => {
  it("writes the knob value to the pad, to two decimals, without touching its trim points", async () => {
    const project = await load();
    const pad = project.samplerJson.pads[0];
    const before = { start: pad.start, end: pad.end };
    const json = await sampler(project, { pitches: new Map([[pad.sampleId, -2.25]]) });
    const out = json.pads.find((p: any) => p.sampleId === pad.sampleId);
    expect(out.pitch).toBe(-2.25);
    expect({ start: out.start, end: out.end }).toEqual(before);
  });

  it("leaves a pad that has no knob value alone", async () => {
    const project = await load();
    const pad = project.samplerJson.pads[1];
    pad.pitch = 3;
    const json = await sampler(project, { pitches: new Map() });
    expect(json.pads.find((p: any) => p.sampleId === pad.sampleId).pitch).toBe(3);
  });

  it("puts what is left after a rendered 808's snap on the knob instead of zero", async () => {
    const project = await load();
    const pad = project.samplerJson.pads[0];
    const frames = 480;
    const tuned = [{ sampleId: pad.sampleId, sampleRate: 48000, channelData: [new Float32Array(frames)], retimed: true }];
    const { blob } = await buildTunedKoala(project, tuned, { pitches: new Map([[pad.sampleId, 1.7]]) });
    const out = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("sampler/sampler.json")!.async("string")).pads.find((p: any) => p.sampleId === pad.sampleId);
    expect(out.pitch).toBe(1.7);
    expect(out.end).toBe(frames);
  });
});

describe("pad rules and stretch", () => {
  it("writes mute group, one-shot, loop, release and tone from the rules", async () => {
    const project = await load();
    const [a, b] = project.samplerJson.pads;
    const json = await sampler(project, { playback: new Map([[a.sampleId, playbackFor("snare")!], [b.sampleId, playbackFor("melodic")!]]) });
    const snare = json.pads.find((p: any) => p.sampleId === a.sampleId);
    const melodic = json.pads.find((p: any) => p.sampleId === b.sampleId);
    expect(String(snare.oneshot)).toBe("true");
    expect(String(snare.looping)).toBe("false");
    expect(snare.chokeGroup).toBe(0);
    expect(snare.tone).toBeLessThan(0);
    expect(String(snare.stretching)).toBe("false");
    expect(String(melodic.oneshot)).toBe("false");
    expect(melodic.release).toBe(1);
    expect(melodic.chokeGroup).toBe(0);
  });

  it("stretches a melodic loop in the modern mode and a drum loop in beats mode, to their length in beats", async () => {
    const project = await load();
    const [a, b] = project.samplerJson.pads;
    const json = await sampler(project, {
      playback: new Map([[a.sampleId, playbackFor("melodicLoop")!], [b.sampleId, playbackFor("drumLoop")!]]),
      stretch: new Map([[a.sampleId, 16], [b.sampleId, 8]]),
    });
    const loop = json.pads.find((p: any) => p.sampleId === a.sampleId);
    const drums = json.pads.find((p: any) => p.sampleId === b.sampleId);
    expect(String(loop.stretching)).toBe("true");
    expect(loop.stretch).toBe(STRETCH_MODE.modern);
    expect(loop.stretchLength).toBe(16);
    expect(loop.chokeGroup).toBe(4);
    expect(String(loop.oneshot)).toBe("true");
    expect(String(loop.looping)).toBe("false");
    expect(String(drums.stretching)).toBe("true");
    expect(drums.stretch).toBe(STRETCH_MODE.beats);
    expect(drums.stretchLength).toBe(8);
  });

  it("never stretches a pad whose rule says stretch off, even if a length is given", async () => {
    const project = await load();
    const pad = project.samplerJson.pads[0];
    const json = await sampler(project, { playback: new Map([[pad.sampleId, playbackFor("kick")!]]), stretch: new Map([[pad.sampleId, 4]]) });
    expect(String(json.pads.find((p: any) => p.sampleId === pad.sampleId).stretching)).toBe("false");
  });
});

describe("normalizing and the volume knob", () => {
  const stat = (peakDb: number, loud: number, category: any) => ({ peakDb, loud, category });

  it("peak-normalizes every file to the ceiling (up or down) and never gains a file down for the mix", () => {
    const { gainDb } = balanceFromStats([stat(-20, -35, "kick"), stat(3, -8, "snare"), stat(-1, -25, "closedHat")], FILE_CEILING_DB);
    expect(gainDb).toEqual([19, -4, 0]);
  });

  it("brings each type to its target loudness with the knob, never above 0 dB, and leaves silence alone", () => {
    const t = ACTIVE_MIX_PRESET.loudness.targetLufs;
    const { gainDb, knobDb } = balanceFromStats([stat(-1, -10, "kick"), stat(-1, -10, "closedHat"), stat(-1, -40, "kick"), { peakDb: -120, loud: null, category: "kick" }], FILE_CEILING_DB);
    expect(gainDb[0] + -10 + knobDb[0]).toBeCloseTo(t.kick, 10);
    expect(gainDb[1] + -10 + knobDb[1]).toBeCloseTo(t.closedHat, 10);
    expect(knobDb[2]).toBe(0);
    expect(knobDb[3]).toBe(0);
    // the same file level puts the kick above the snare and the hat under it
    const same = balanceFromStats(["kick", "snare", "closedHat", "openHat", "cymbal"].map((c) => stat(-1, -10, c)), FILE_CEILING_DB).knobDb;
    expect(same[0]).toBeGreaterThan(same[1]);
    expect(same[2]).toBeLessThan(same[1]);
    expect(same[3]).toBeLessThan(same[1]);
    expect(same[4]).toBeLessThan(same[1]);
  });
});
