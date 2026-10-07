import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";
import { BUS_NAMES, CATEGORY_BUS } from "./routing";
import { appendAfterExisting, fillEmptySlots, kickClipper, masterChain, melodicEq, type MixerSlot } from "./mixerChain";

async function load(mixer?: unknown): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/calibration/calibration.koala", import.meta.url)));
  if (mixer) zip.file("mixer.json", JSON.stringify(mixer));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: p.pad, sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: "calibration.koala", pads, padBase: 0 };
}

const exported = async (project: ParsedKoalaProject, options: Parameters<typeof buildTunedKoala>[2]) => {
  const { blob } = await buildTunedKoala(project, [], options);
  return JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("mixer.json")!.async("string"));
};

describe("bus routing", () => {
  it("gives the kick a bus of its own, puts every bass sound on the next one and the melodic loops on bus D", () => {
    expect(CATEGORY_BUS.kick).toBe(0);
    expect(BUS_NAMES[0]).toBe("Kick");
    expect(Object.entries(CATEGORY_BUS).filter(([, bus]) => bus === 0).map(([c]) => c)).toEqual(["kick"]);
    expect(CATEGORY_BUS.melodicLoop).toBe(3);
    expect(CATEGORY_BUS.bass).toBe(1);
    expect(BUS_NAMES[1]).toBe("Bass");
  });
});

describe("filling empty slots", () => {
  it("keeps what is already there and fills the empty slots in order", () => {
    const eq = { bypass: false, name: "EQ", parameters: {} };
    const chain: MixerSlot[] = [null, eq, null, null, null];
    expect(fillEmptySlots(chain, [kickClipper()])).toBe(true);
    expect(chain.map((s) => s?.name ?? null)).toEqual(["CLIPPER", "EQ", null, null, null]);
  });

  it("changes nothing when the effects do not all fit", () => {
    const full: MixerSlot[] = Array.from({ length: 5 }, () => ({ bypass: false, name: "X", parameters: {} }));
    expect(fillEmptySlots(full, [kickClipper()])).toBe(false);
    expect(full.every((s) => s?.name === "X")).toBe(true);
  });
});

describe("mixer export", () => {
  it("names the buses, writes no sidechain anywhere and fills an empty master strip", async () => {
    const mixer = await exported(await load(), { busNames: BUS_NAMES, busEffects: true, masterChain: true });
    expect(mixer.buses.map((b: any) => b.name)).toEqual(BUS_NAMES);
    expect([...mixer.buses.flatMap((b: any) => b.chain), ...mixer.master.chain].some((s: any) => s?.name === "SIDECHAIN")).toBe(false);
    expect(mixer.master.chain.map((s: any) => s.name)).toEqual(masterChain().map((s) => s.name));
  });

  it("writes the chosen master style", async () => {
    const dynamic = await exported(await load(), { masterChain: true, masterStyle: "dynamic" });
    const loud = await exported(await load(), { masterChain: true, masterStyle: "loud" });
    const gain = (m: any) => m.master.chain.find((s: any) => s?.name === "LIMITER").parameters.gain;
    expect(gain(dynamic)).toBe(masterChain("dynamic").find((s) => s.name === "LIMITER")!.parameters.gain);
    expect(gain(loud)).toBe(masterChain("loud").find((s) => s.name === "LIMITER")!.parameters.gain);
    expect(gain(loud)).not.toBe(gain(dynamic));
  });

  it("never doubles a bus plugin, adds bus plugins after the ones already there, and replaces a master chain", async () => {
    const strip = (name: string, chain: unknown[]) => ({ chain, mute: false, name, solo: false, volume: 0 });
    const empty = [null, null, null, null, null];
    const mine = { bypass: false, name: "COMPRESSOR", parameters: { ratio: 4 } };
    const project = await load({
      buses: [strip("a", [null, mine, null, null, null]), strip("b", empty), strip("c", empty), strip("d", empty)],
      master: strip("MAIN", [null, mine, null, null, null]),
    });
    const mixer = await exported(project, { busEffects: true, masterChain: true });
    // The kick bus keeps its own plugin first, and the clipper goes after it.
    expect(mixer.buses[0].chain.map((s: any) => s?.name ?? null)).toEqual([null, "COMPRESSOR", "CLIPPER", null, null]);
    // The master chain wipes out what was there.
    expect(mixer.master.chain.map((s: any) => s?.name)).toEqual(masterChain().map((s) => s.name));
  });

  it("appends after the last effect and refuses when there is no room", () => {
    const fx = { bypass: false, name: "EQ", parameters: {} };
    const chain = [fx, null, fx, null, null];
    expect(appendAfterExisting(chain, [kickClipper()])).toBe(true);
    expect(chain.map((s) => s?.name ?? null)).toEqual(["EQ", null, "EQ", "CLIPPER", null]);
    const tight = [null, null, null, null, fx];
    expect(appendAfterExisting(tight, [kickClipper()])).toBe(false);
    expect(tight[0]).toBeNull();
  });
});

describe("effect parameters", () => {
  // Koala mixers saved with every plugin parameter at its minimum and at its maximum (EQ frequencies were left alone).
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../../docs/fixtures/${name}`, import.meta.url), "utf8"));
  const lo = read("mixer-all-min.json");
  const hi = read("mixer-all-max.json");
  const find = (mixer: any, fxName: string) => [...mixer.buses.flatMap((b: any) => b.chain), ...mixer.master.chain].find((s: any) => s?.name === fxName);

  it.each([...masterChain("loud"), ...masterChain("dynamic"), kickClipper(), melodicEq()].map((fx) => [fx.name, fx] as const))("%s uses Koala's parameter names and stays inside their range", (name, fx) => {
    const a = find(lo, name).parameters;
    const b = find(hi, name).parameters;
    expect(Object.keys(fx.parameters).sort()).toEqual(Object.keys(a).sort());
    for (const [key, value] of Object.entries(fx.parameters)) {
      if (key.endsWith(" freq")) continue;
      // HQ and auto make-up are on/off buttons: 0 or 1.
      if (key === "oversample" || key === "makeup") {
        expect([0, 1], `${name} ${key}`).toContain(value);
        continue;
      }
      const [min, max] = [Math.min(a[key], b[key]), Math.max(a[key], b[key])];
      expect(value, `${name} ${key}`).toBeGreaterThanOrEqual(min - 1e-6);
      expect(value, `${name} ${key}`).toBeLessThanOrEqual(max + 1e-6);
    }
  });
});

describe("kick clipping, melodic EQ and per-pad EQ", () => {
  it("puts an EQ on the melodic bus only", async () => {
    const mixer = await exported(await load(), { busNames: BUS_NAMES, busEffects: true });
    expect(mixer.buses[3].chain.filter((s: any) => s?.name === "EQ")).toHaveLength(1);
    expect(mixer.buses.slice(0, 3).some((b: any) => b.chain.some((s: any) => s?.name === "EQ"))).toBe(false);
  });

  it("puts a clipper on the kick bus once, and none on the others", async () => {
    const options = { busNames: BUS_NAMES, busEffects: true } as const;
    const mixer = await exported(await load(), options);
    expect(mixer.buses[0].chain.filter((s: any) => s?.name === "CLIPPER")).toHaveLength(1);
    expect(mixer.buses[0].chain.find((s: any) => s?.name === "CLIPPER").parameters).toMatchObject({ input: 4, threshold: -6, oversample: 1 });
    expect(mixer.buses.slice(1).some((b: any) => b.chain.some((s: any) => s?.name === "CLIPPER"))).toBe(false);
    const again = await exported(await load(mixer), options);
    expect(again.buses[0].chain.filter((s: any) => s?.name === "CLIPPER")).toHaveLength(1);
  });

  it("high-passes a pad and cuts its high shelf while keeping its other EQ settings", async () => {
    const project = await load();
    const pad = project.samplerJson.pads[0];
    pad.eq = { enabled: "true", lo: { type: "highpass", freq: 138, gain: -18, q: 1 }, mid: { type: "peaking", freq: 2000, gain: 3, q: 1 }, hi: { type: "highshelf", freq: 8000, gain: 0, q: 1 } };
    const { blob } = await buildTunedKoala(project, [], { playback: new Map([[pad.sampleId, { eq: { highpassHz: 300, highShelfDb: -2 } }]]) });
    const json = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file("sampler/sampler.json")!.async("string"));
    const eq = json.pads.find((p: any) => p.sampleId === pad.sampleId).eq;
    expect(eq.lo).toMatchObject({ type: "highpass", freq: 300 });
    expect(eq.hi).toMatchObject({ type: "highshelf", freq: 8000, gain: -2 });
    expect(eq.mid).toEqual({ type: "peaking", freq: 2000, gain: 3, q: 1 });
    expect(eq.enabled).toBe("true");
  });
});
