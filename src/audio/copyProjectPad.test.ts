import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { copyProjectPad } from "./copyProjectPad";
import type { ParsedKoalaProject } from "./koalaProject";

const fixture = (): ParsedKoalaProject => {
  const zip = new JSZip();
  zip.file("sampler/7.wav", new Uint8Array([1, 2, 3, 4]));
  zip.file("sequence.json", '{"tempo":123,"patterns":[{"name":"keep"}]}');
  const samplerJson = { title: "keep", pads: [{ pad: 4, type: "sample", sampleId: 7, pitch: 2, muteGroup: 5, bus: 1 }], samples: [{ id: 7, metadata: { originalPath: "bass.wav", tunegodLibraryId: "favorite" } }] };
  zip.file("sampler/sampler.json", JSON.stringify(samplerJson));
  return { zip, samplerJson, originalName: "kit.koala", padBase: 0, pads: [{ pad: 4, sampleId: 7, fileName: "bass.wav" }] };
};

describe("copyProjectPad", () => {
  it("preserves the original while giving the copy independent export identities and the same audio/settings", async () => {
    const original = fixture();
    const copied = await copyProjectPad(original, 4);
    expect(copied.ref).toEqual({ pad: 5, sampleId: 8, fileName: "bass.wav" });
    expect(original.pads).toHaveLength(1);
    expect(original.samplerJson.pads).toHaveLength(1);
    expect(original.zip.file("sampler/8.wav")).toBeNull();
    const written = await JSZip.loadAsync(await copied.file.arrayBuffer());
    const json = JSON.parse(await written.file("sampler/sampler.json")!.async("string"));
    expect(json.pads).toEqual([original.samplerJson.pads[0], { ...original.samplerJson.pads[0], pad: 5, sampleId: 8 }]);
    expect(await written.file("sampler/8.wav")!.async("uint8array")).toEqual(await original.zip.file("sampler/7.wav")!.async("uint8array"));
    expect(await written.file("sequence.json")!.async("string")).toBe(await original.zip.file("sequence.json")!.async("string"));
    expect(json.samples[1].metadata).toEqual(json.samples[0].metadata);
    copied.project.samplerJson.pads[1].pitch = -3;
    expect(copied.project.samplerJson.pads[0].pitch).toBe(2);
    expect(original.samplerJson.pads[0].pitch).toBe(2);
  });

  it("rejects missing source audio without changing the project", async () => {
    const original = fixture();
    original.zip.remove("sampler/7.wav");
    await expect(copyProjectPad(original, 4)).rejects.toThrow("source sound is unavailable");
    expect(original.samplerJson.pads).toHaveLength(1);
  });
});
