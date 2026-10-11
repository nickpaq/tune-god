import { describe, expect, it } from "vitest";
import { findPackInFileList, acceptsOneShotDuration, writeBankSounds } from "./packProject";
import type { ParsedKoalaProject } from "./koalaProject";
import JSZip from "jszip";
import { encodeWav } from "./wavEncode";
import { planKit, planOneShots } from "./bankLoad";

const picked = (path: string) => {
  const file = new File([new Uint8Array(8)], path.split("/").at(-1)!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
};

describe("original folder paths", () => {
  it("preserves every folder and the original filename for display", () => {
    const pack = findPackInFileList([picked("Library/Pack Name/Percussion/Piano.wav")]);
    expect(pack.files[0].sourcePath).toBe("Library/Pack Name/Percussion/Piano.wav");
    expect(planKit(pack.files).groups[0].category).toBe("perc");
  });
  it("classifies the selected root without treating it as a subfolder", () => {
    const pack = findPackInFileList([picked("Melodic One Shots/Kick.wav")]);
    expect(pack.files[0].folders).toEqual([]);
    expect(planOneShots(pack.files).groups[0].category).toBe("melodic");
    const bells = findPackInFileList([picked("Bells/Synth.wav")]);
    expect(planOneShots(bells.files).groups).toEqual([]);
    expect(planKit(bells.files).groups[0].category).toBe("perc");
  });
  it("identifies 808s from the selected folder or filename within the bass family", () => {
    expect(planKit(findPackInFileList([picked("808/Piano.wav")]).files, Math.random, { additionalBanks: 1 }).groups[0].is808).toBe(true);
    expect(planKit(findPackInFileList([picked("Bass/808.wav")]).files, Math.random, { additionalBanks: 1 }).groups[0].is808).toBe(true);
  });
});

describe("one-shot duration limits", () => {
  it("keeps bass tails up to five seconds but excludes longer bass and songs", () => {
    expect(acceptsOneShotDuration("bass", 5)).toBe(true);
    expect(acceptsOneShotDuration("bass", 5.001)).toBe(false);
    expect(acceptsOneShotDuration("bass", 180)).toBe(false);
  });
  it("keeps melodic tails up to six seconds while leaving loops eligible", () => {
    expect(acceptsOneShotDuration("melodic", 6)).toBe(true);
    expect(acceptsOneShotDuration("melodic", 6.001)).toBe(false);
    expect(acceptsOneShotDuration("melodicLoop", 16)).toBe(true);
    expect(acceptsOneShotDuration("bassLoop", 16)).toBe(true);
  });
  it("rejects invalid decoded durations", () => {
    for (const duration of [0, -1, NaN, Infinity]) expect(acceptsOneShotDuration("bass", duration)).toBe(false);
  });
});

describe("one-shot import safety", () => {
  it("skips long mislabeled bass and short explicit loops, continuing to a valid hit", async () => {
    const project: ParsedKoalaProject = { zip: new JSZip(), samplerJson: { pads: [], samples: [] }, originalName: "test.koala", padBase: 0, pads: [] };
    const candidate = (name: string, seconds: number) => {
      const data = Float32Array.from({ length: Math.round(seconds * 1000) }, (_, i) => Math.sin(i) * 0.3);
      const blob = encodeWav({ sampleRate: 1000, channelData: [data], bitDepth: 24 });
      return { name, folders: ["Bass"], size: blob.size, source: async () => new File([blob], name) };
    };
    const result = await writeBankSounds(project, [{ category: "bass", want: 1, candidates: [candidate("808_long.wav", 6), candidate("808_loop.wav", 2), candidate("808_hit.wav", 1)] }], { existing: [], byteBudget: 1000000 });
    expect(result?.skipped).toBe(2);
    expect(result?.sounds.map((s) => s.sourceName)).toEqual(["808_hit.wav"]);
    const written = await JSZip.loadAsync(await result!.file.arrayBuffer());
    expect(JSON.parse(await written.file("sampler/sampler.json")!.async("string")).pads).toHaveLength(1);
    expect(result?.sounds[0].category).toBe("bass");
  });
});
