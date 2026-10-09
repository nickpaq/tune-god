import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseKoalaProject } from "../koalaProject";
import { freeHalftimeLoopSlot, halftimeLabel, stageHalftimeLoop } from "./loopPad";
import { buildTunedKoala } from "../exportProject";
import type { Pad } from "../../components/PadPanel";
beforeAll(() => vi.stubGlobal("FileReader", class {
  result: ArrayBuffer | null = null;
  onload: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(bytes => { this.result = bytes; this.onload?.({ target: this }); }).catch(error => this.onerror?.(error)); }
}));
afterAll(() => vi.unstubAllGlobals());
const pad = (index: number, locked = false): Pad => ({ index, origIndex: index, locked, sampleId: index + 1, name: "source", sampleRate: 1000, channelData: [new Float32Array(2000)], tune: false, semis: 0, cents: 0 });
describe("Halftime bounce placement", () => {
  it("uses the first free melodic-loop pad and never the bass row or Bank D", () => {
    const pads = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [16 + i, pad(16 + i)]));
    delete pads[21];
    expect(freeHalftimeLoopSlot(pads)).toBe(21);
    pads[21] = pad(21); expect(freeHalftimeLoopSlot(pads)).toBeNull();
  });
  it("does not replace a locked empty placeholder", () => {
    const empty = { ...pad(16, true), placeholder: { kind: "empty" as const, label: "Empty" } };
    expect(freeHalftimeLoopSlot({ 16: empty })).toBe(17);
  });
  it("labels BPM and the exact musical duration", () => {
    expect(halftimeLabel(120, 96000, 48000, 4)).toBe("Half · 120 BPM · 1 bar");
    expect(halftimeLabel(127.5, 48000 * 10, 48000, 4)).toBe("Half · 127.5 BPM · 5.31 bars");
  });
  it("writes a separate processed WAV and preserves all source files through a Koala export", async () => {
    const file = new File([readFileSync(new URL("../../../docs/calibration/calibration.koala", import.meta.url))], "source.koala");
    const source = await parseKoalaProject(file);
    const oldPads = source.samplerJson.pads.map((p: any) => ({ ...p }));
    const originals = source.zip.file(/^sampler\/.*\.wav$/).map(f => f.name);
    const bounce = { channelData: [Float32Array.from({ length: 2000 }, (_, i) => Math.sin(i * 0.1) * 0.5)], sampleRate: 1000, bpm: 120, name: "source" };
    const staged = await stageHalftimeLoop(source, bounce, 4);
    expect(source.samplerJson.pads).toEqual(oldPads);
    for (const path of originals) expect(staged.project.zip.file(path)).not.toBeNull();
    const mapping = new Map<number, number | null>([[staged.origIndex, 16]]);
    const built = await buildTunedKoala(staged.project, [], { arrangement: mapping, bpm: 120 });
    const output = await parseKoalaProject(new File([built.blob], "finished.koala"));
    const placed = output.samplerJson.pads.find((p: any) => Number(p.pad) - output.padBase === 16);
    expect(placed.sampleId).toBe(staged.sampleId);
    expect(placed.label).toBe("Half · 120 BPM · 1 bar");
    expect(output.zip.file(`sampler/${placed.sampleId}.wav`)).not.toBeNull();
    for (const path of originals) expect(output.zip.file(path)).not.toBeNull();
  });
});
