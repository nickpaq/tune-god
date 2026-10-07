import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTunedKoala } from "./exportProject";
import type { ParsedKoalaProject } from "./koalaProject";
import { BUS_NAMES, CATEGORY_BUS } from "./routing";
import { sidechainStatus } from "./sidechain";

describe("sidechainStatus", () => {
  it("is locked until Organize is on and a kick and a bass are both on the pads", () => {
    expect(sidechainStatus(["kick", "bass"], false).blocker).toBe("organize");
    expect(sidechainStatus([], true).blocker).toBe("kick");
    expect(sidechainStatus(["snare", "bass"], true).blocker).toBe("kick");
    expect(sidechainStatus(["kick", "snare"], true).blocker).toBe("bass");
    expect(sidechainStatus(["kick", "bass", "snare"], true)).toEqual({ hasKick: true, hasBass: true, ready: true, blocker: null });
  });

  it("follows the pads: swapping the only kick out locks it, swapping a kit in with a kick unlocks it", () => {
    const kit = ["kick", "snare", "closedHat", "bass"] as const;
    expect(sidechainStatus([...kit], true).ready).toBe(true);
    // the kick is hot swapped for a perc (it goes to the spares, which are not on the pads)
    expect(sidechainStatus(kit.map((c) => (c === "kick" ? "perc" : c)), true).ready).toBe(false);
    // a new kit with a kick arrives
    expect(sidechainStatus(["kick", "snare", "bass"], true).ready).toBe(true);
  });
});

async function load(): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(readFileSync(new URL("../../docs/calibration/calibration.koala", import.meta.url)));
  const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
  const pads = samplerJson.pads.map((p: any) => ({ pad: p.pad, sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
  return { zip, samplerJson, originalName: "calibration.koala", pads, padBase: 0 };
}

const exported = async (buses: Map<number, number>) => {
  const { blob } = await buildTunedKoala(await load(), [], { buses, busNames: BUS_NAMES });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    sampler: JSON.parse(await zip.file("sampler/sampler.json")!.async("string")),
    mixer: JSON.parse(await zip.file("mixer.json")!.async("string")),
  };
};

describe("the routing follows whichever sounds are on the pads at export", () => {
  it("puts the kick on bus A and the bass on bus B, and moves them when the kit is swapped", async () => {
    const [a, b] = (await load()).pads.slice(0, 2).map((p) => p.sampleId);
    const first = await exported(new Map([[a, CATEGORY_BUS.kick], [b, CATEGORY_BUS.bass]]));
    const busOf = (j: any, id: number) => j.sampler.pads.find((p: any) => p.sampleId === id).bus;
    expect([busOf(first, a), busOf(first, b)]).toEqual([0, 1]);
    // the kick and bass swap places on the pads: the buses swap with them
    const second = await exported(new Map([[a, CATEGORY_BUS.bass], [b, CATEGORY_BUS.kick]]));
    expect([busOf(second, a), busOf(second, b)]).toEqual([1, 0]);
    // no sidechain is written for either order
    for (const j of [first, second]) expect(j.mixer.buses.some((b: any) => b.chain.some((fx: any) => fx?.name === "SIDECHAIN"))).toBe(false);
  });
});
