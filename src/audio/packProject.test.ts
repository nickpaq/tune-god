import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildPackProject, findPackInFileList } from "./packProject";
import { encodeWav } from "./wavEncode";

const wav = (frames: number) => encodeWav({ sampleRate: 44100, channelData: [new Float32Array(frames).fill(0.1)], bitDepth: 16 });

describe("sample pack project", () => {
  it("zips an even mix of the pack's types into a project and remembers each pad's type", async () => {
    const list: File[] = [];
    for (const folder of ["Kicks", "Snares", "Hats"]) {
      for (let i = 0; i < 40; i++) {
        const f = new File([wav(100 + i)], `${folder}-${i}.wav`);
        Object.defineProperty(f, "webkitRelativePath", { value: `My Pack/${folder}/${f.name}` });
        list.push(f);
      }
    }
    list.push(new File(["x"], "readme.txt"));
    const pack = findPackInFileList(list);
    expect(pack.name).toBe("My Pack");
    expect(pack.files).toHaveLength(120);

    const built = (await buildPackProject(pack))!;
    expect(built.file.name).toBe("My Pack.koala");
    const zip = await JSZip.loadAsync(await built.file.arrayBuffer());
    const json = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    expect(json.pads).toHaveLength(64);
    expect(json.pads.map((p: any) => p.pad)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    for (const p of json.pads) expect(zip.file(`sampler/${p.sampleId}.wav`)).not.toBeNull();

    const counts: Record<string, number> = {};
    for (const c of Object.values(built.categories)) counts[c] = (counts[c] ?? 0) + 1;
    expect(Object.keys(counts).sort()).toEqual(["closedHat", "kick", "snare"]);
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(1);
  });

  it("returns null when the folder holds no audio", async () => {
    expect(await buildPackProject({ name: "empty", files: [] })).toBeNull();
  });
});
