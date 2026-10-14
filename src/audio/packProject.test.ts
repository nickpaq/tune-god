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
  it("keeps 808 folders and filenames in the shared bass Type quota", () => {
    expect(planKit(findPackInFileList([picked("808/Piano.wav")]).files, Math.random).groups[0].category).toBe("bass");
    expect(planKit(findPackInFileList([picked("Bass/808.wav")]).files, Math.random).groups[0].category).toBe("bass");
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

it("rejects decoded audio over budget even when its source file advertises a tiny compressed size", async () => {
  const project: ParsedKoalaProject = { zip: new JSZip(), samplerJson: { pads: [], samples: [] }, originalName: "test.koala", padBase: 0, pads: [] };
  const blob = encodeWav({ sampleRate: 1000, channelData: [new Float32Array(10000)], bitDepth: 24 });
  const result = await writeBankSounds(project, [{ category: "fx", want: 1, candidates: [{ name: "fx.wav", folders: ["FX"], size: 100, source: async () => new File([blob], "fx.wav") }] }], { existing: [], byteBudget: 10000 });
  expect(result).toBeNull();
  expect(project.pads).toHaveLength(0);
});


it("fills a sparse kit with actual available Types and shares audio rather than encoding duplicates", async () => {
  const project: ParsedKoalaProject = { zip: new JSZip(), samplerJson: { pads: [], samples: [] }, originalName: "test.koala", padBase: 0, pads: [] };
  const blob = encodeWav({ sampleRate: 1000, channelData: [new Float32Array(1000)], bitDepth: 24 });
  const result = await writeBankSounds(project, [], { existing: [], byteBudget: 1000000, fillTo: 48, random: () => 0, fallbackCandidates: [
    { name: "broken.wav", folders: ["Kicks"], size: 4, source: async () => new File(["oops"], "broken.wav") },
    { name: "kick.wav", folders: ["Kicks"], size: blob.size, source: async () => new File([blob], "kick.wav") },
  ] });
  expect(result?.sounds).toHaveLength(48);
  expect(result?.skipped).toBe(1);
  expect(result?.sounds.every(sound => sound.category === "kick")).toBe(true);
  expect(new Set(result?.sounds.map(sound => sound.pad)).size).toBe(48);
  expect(new Set(result?.sounds.map(sound => sound.sampleId)).size).toBe(1);
  const written = await JSZip.loadAsync(await result!.file.arrayBuffer());
  const json = JSON.parse(await written.file("sampler/sampler.json")!.async("string"));
  expect(json.pads).toHaveLength(48);
  expect(json.samples).toHaveLength(1);
});

describe("levelling is optional", () => {
  const load = async (levelling: boolean) => {
    const project: ParsedKoalaProject = { zip: new JSZip(), samplerJson: { pads: [], samples: [] }, originalName: "test.koala", padBase: 0, pads: [] };
    const data = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i / 20) * 0.1);
    const blob = encodeWav({ sampleRate: 44100, channelData: [data], bitDepth: 24 });
    const result = await writeBankSounds(project, [{ category: "kick", want: 1, candidates: [{ name: "kick.wav", folders: ["Kicks"], size: blob.size, source: async () => new File([blob], "kick.wav") }] }], { existing: [], byteBudget: 1000000, levelling });
    const bytes = new Uint8Array(await project.zip.file(`sampler/${result!.sounds[0].sampleId}.wav`)!.async("uint8array"));
    let peak = 0;
    for (let i = 44; i + 2 < bytes.length; i += 3) {
      const v = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16)) << 8 >> 8;
      peak = Math.max(peak, Math.abs(v) / 0x7fffff);
    }
    return { peak, vol: project.samplerJson.pads[0].vol };
  };
  it("writes the sound as it came in, with the volume knob untouched, when levelling is off", async () => {
    const off = await load(false);
    expect(off.peak).toBeCloseTo(0.1, 2);
    expect(off.vol).toBe(1);
  });
  it("peak-normalizes the file when levelling is on", async () => {
    const on = await load(true);
    expect(on.peak).toBeGreaterThan(0.8);
  });
});
