import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import { resolvePlayback, type PadPlayback } from "./padSettings";
import type { ParsedKoalaProject } from "./koalaProject";
import type { CategoryId } from "./classify";
const cases: [CategoryId, number, boolean, number, boolean][] = [
  ["kick", 0, true, 0, false],
  ["snare", 1, true, 0, false],
  ["clap", 1, true, 0, false],
  ["closedHat", 1, true, 1, false],
  ["openHat", 1, true, 1, false],
  ["cymbal", 1, true, 2, false],
  ["perc", 1, true, 0, false],
  ["drumLoop", 3, false, 3, true],
  ["melodic", 2, true, 0, false],
  ["melodicLoop", 2, false, 4, true],
  ["bass", 0, true, 5, false],
  ["bassLoop", 0, false, 5, true],
  ["vox", 3, true, 0, false],
  ["voxLoop", 3, false, 6, true],
  ["fx", 3, true, 0, false],
  ["riser", 3, true, 0, false],
  ["fall", 3, true, 0, false],
  ["fxLoop", 3, false, 0, true],
];
describe("Koala product specification", () => {
  it("writes every default using real Koala fields and preserves metadata", async () => {
    const zip = await JSZip.loadAsync(
      readFileSync(
        new URL("../../docs/calibration/calibration.koala", import.meta.url),
      ),
    );
    const json = JSON.parse(
      await zip.file("sampler/sampler.json")!.async("string"),
    );
    const template = json.pads[0];
    json.pads = cases.map((_, i) => ({
      ...template,
      pad: i,
      sampleId: i + 100,
      oneshot: i % 2 ? false : "false",
      stretching: i % 2 ? false : "false",
      customPadField: "kept",
    }));
    json.customProjectField = { keep: true };
    const project: ParsedKoalaProject = {
      zip,
      samplerJson: json,
      originalName: "spec.koala",
      padBase: 0,
      pads: [],
    };
    const padPlayback = new Map<number, PadPlayback>();
    const stretch = new Map<number, number>();
    cases.forEach(([category], i) => {
      padPlayback.set(i, resolvePlayback(category));
      stretch.set(i + 100, 16);
    });
    const { blob } = await buildTunedKoala(project, [], {
      padPlayback,
      stretch,
    });
    const outZip = await JSZip.loadAsync(await blob.arrayBuffer());
    const out = JSON.parse(
      await outZip.file("sampler/sampler.json")!.async("string"),
    );
    expect(out.customProjectField).toEqual({ keep: true });
    expect(await outZip.file("song.json")?.async("string")).toBe(
      await zip.file("song.json")?.async("string"),
    );
    cases.forEach(([category, bus, oneShot, choke, stretches], i) => {
      const pad = out.pads[i];
      expect(pad.bus, category).toBe(bus);
      expect(String(pad.oneshot), category).toBe(String(oneShot));
      expect(pad.chokeGroup, category).toBe(choke);
      expect(String(pad.stretching), category).toBe(String(stretches));
      expect(pad.customPadField).toBe("kept");
      if (stretches) expect(pad.stretchLength).toBe(16);
    });
  });
  it("applies override precedence, and supports pads sharing one sample with different controls", async () => {
    expect(
      resolvePlayback(
        "bassLoop",
        { chokeGroup: 9, bus: 2 },
        { chokeGroup: 5, oneShot: true },
        false,
      ),
    ).toMatchObject({ chokeGroup: 5, bus: 2, oneShot: true, stretch: "off" });
    const zip = new JSZip();
    const pads = [0, 1].map((pad) => ({
      pad,
      sampleId: 1,
      type: "sample",
      custom: pad,
    }));
    const project: ParsedKoalaProject = {
      zip,
      samplerJson: { pads },
      pads: [],
      padBase: 0,
      originalName: "shared.koala",
    };
    const { blob } = await buildTunedKoala(project, [], {
      playback: new Map([[1, resolvePlayback("kick")]]),
      padPlayback: new Map([
        [0, resolvePlayback("bass")],
        [1, resolvePlayback("vox", undefined, { chokeGroup: 8 })],
      ]),
      padOverrides: new Map([
        [0, null],
        [1, { chokeGroup: 8 }],
      ]),
      classifications: new Map([[0, { category: "bass", confidence: 1 }]]),
    });
    const out = JSON.parse(
      await (
        await JSZip.loadAsync(await blob.arrayBuffer())
      )
        .file("sampler/sampler.json")!
        .async("string"),
    );
    expect(out.pads[0]).toMatchObject({
      bus: 0,
      chokeGroup: 5,
      tunegodClassification: { category: "bass" },
    });
    expect(out.pads[0].tunegodPlayback).toBeUndefined();
    expect(out.pads[1]).toMatchObject({
      bus: 3,
      chokeGroup: 8,
      tunegodPlayback: { chokeGroup: 8 },
    });
  });
});
