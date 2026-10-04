import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";
import { BUS_NAMES, CATEGORY_BUS } from "./routing";
import { bassSidechain, fillEmptySlots, masterChain, SIDECHAIN_SOURCE_BUS, type MixerSlot } from "./mixerChain";

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
  it("gives the kick a bus of its own and puts every bass sound on the bus that is sidechained", () => {
    expect(CATEGORY_BUS.kick).toBe(SIDECHAIN_SOURCE_BUS);
    expect(BUS_NAMES[SIDECHAIN_SOURCE_BUS]).toBe("Kick");
    expect(Object.entries(CATEGORY_BUS).filter(([, bus]) => bus === SIDECHAIN_SOURCE_BUS).map(([c]) => c)).toEqual(["kick"]);
    expect(CATEGORY_BUS.bass).toBe(1);
    expect(BUS_NAMES[1]).toBe("Bass");
  });
});

describe("filling empty slots", () => {
  it("keeps what is already there and fills the empty slots in order", () => {
    const eq = { bypass: false, name: "EQ", parameters: {} };
    const chain: MixerSlot[] = [null, eq, null, null, null];
    expect(fillEmptySlots(chain, [bassSidechain()])).toBe(true);
    expect(chain.map((s) => s?.name ?? null)).toEqual(["SIDECHAIN", "EQ", null, null, null]);
  });

  it("changes nothing when the effects do not all fit", () => {
    const full: MixerSlot[] = Array.from({ length: 5 }, () => ({ bypass: false, name: "X", parameters: {} }));
    expect(fillEmptySlots(full, [bassSidechain()])).toBe(false);
    expect(full.every((s) => s?.name === "X")).toBe(true);
  });
});

describe("mixer export", () => {
  it("names the buses, sidechains the bass bus from the kick bus and fills an empty master strip", async () => {
    const mixer = await exported(await load(), { busNames: BUS_NAMES, sidechain: true, masterChain: true });
    expect(mixer.buses.map((b: any) => b.name)).toEqual(BUS_NAMES);
    const duck = mixer.buses[1].chain.find((s: any) => s?.name === "SIDECHAIN");
    expect(duck.parameters.source).toBe(SIDECHAIN_SOURCE_BUS);
    expect(mixer.master.chain.map((s: any) => s.name)).toEqual(masterChain().map((s) => s.name));
  });

  it("never doubles a sidechain and leaves a master chain the user already built alone", async () => {
    const strip = (name: string, chain: unknown[]) => ({ chain, mute: false, name, solo: false, volume: 0 });
    const empty = [null, null, null, null, null];
    const mine = { bypass: false, name: "COMPRESSOR", parameters: { ratio: 4 } };
    const project = await load({
      buses: [strip("a", empty), strip("b", [bassSidechain(), null, null, null, null]), strip("c", empty), strip("d", empty)],
      master: strip("MAIN", [null, mine, null, null, null]),
    });
    const mixer = await exported(project, { sidechain: true, masterChain: true });
    expect(mixer.buses[1].chain.filter((s: any) => s?.name === "SIDECHAIN")).toHaveLength(1);
    expect(mixer.master.chain).toEqual([null, mine, null, null, null]);
  });
});

describe("effect parameters", () => {
  // Koala mixers saved with every plugin parameter at its minimum and at its maximum (EQ frequencies were left alone).
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../../docs/fixtures/${name}`, import.meta.url), "utf8"));
  const lo = read("mixer-all-min.json");
  const hi = read("mixer-all-max.json");
  const find = (mixer: any, fxName: string) => [...mixer.buses.flatMap((b: any) => b.chain), ...mixer.master.chain].find((s: any) => s?.name === fxName);

  it.each([...masterChain(), bassSidechain()].map((fx) => [fx.name, fx] as const))("%s uses Koala's parameter names and stays inside their range", (name, fx) => {
    const a = find(lo, name).parameters;
    const b = find(hi, name).parameters;
    expect(Object.keys(fx.parameters).sort()).toEqual(Object.keys(a).sort());
    for (const [key, value] of Object.entries(fx.parameters)) {
      if (key.endsWith(" freq")) continue;
      const [min, max] = [Math.min(a[key], b[key]), Math.max(a[key], b[key])];
      expect(value, `${name} ${key}`).toBeGreaterThanOrEqual(min - 1e-6);
      expect(value, `${name} ${key}`).toBeLessThanOrEqual(max + 1e-6);
    }
  });
});
