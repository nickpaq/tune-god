import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { appendPackToProject, buildPackProject, findPackInFileList } from "./packProject";
import { fillPlan } from "./packFill";
import { layoutById } from "./fingerLayouts";
import type { ParsedKoalaProject } from "./koalaProject";
import { parseWav } from "./decode";
import { encodeWav } from "./wavEncode";

// A 440 Hz tone, so it has a loudness to measure; `level` is its peak amplitude.
const tone = (frames: number, level: number) =>
  Float32Array.from({ length: frames }, (_, i) => level * Math.sin((2 * Math.PI * 440 * i) / 44100));
const wav = (frames: number, level = 0.1) => encodeWav({ sampleRate: 44100, channelData: [tone(frames, level)], bitDepth: 16 });

const KIT = { kick: 1, snare: 1, closedHat: 1 };

describe("sample pack project", () => {
  it("zips the kit sounds and their hidden spares into a project and remembers each pad's type", async () => {
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

    const built = (await buildPackProject(pack, { kitSlots: KIT }))!;
    expect(built.file.name).toBe("My Pack.koala");
    const zip = await JSZip.loadAsync(await built.file.arrayBuffer());
    const json = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    // One sound per kit slot on the pads, and ten spares per type numbered past the grid so they sit on no pad.
    expect(json.pads.map((p: any) => p.pad)).toEqual([0, 1, 2, ...Array.from({ length: 30 }, (_, i) => 64 + i)]);
    for (const p of json.pads) expect(zip.file(`sampler/${p.sampleId}.wav`)).not.toBeNull();

    const shown = Object.entries(built.categories).filter(([pad]) => Number(pad) < 64).map(([, c]) => c).sort();
    expect(shown).toEqual(["closedHat", "kick", "snare"]);
    const spare = Object.entries(built.categories).filter(([pad]) => Number(pad) >= 64).map(([, c]) => c);
    for (const c of ["closedHat", "kick", "snare"]) expect(spare.filter((s) => s === c)).toHaveLength(10);
  });

  it("levels the sounds as it builds: gain goes into the audio, the type's mix onto the pad knob", async () => {
    const list: File[] = [];
    // Same tone, one quiet and one loud, both kicks: they should come out at the same level.
    for (const [name, level] of [["quiet", 0.05], ["loud", 0.5]] as const) {
      const f = new File([wav(22050, level)], `${name}.wav`);
      Object.defineProperty(f, "webkitRelativePath", { value: `Pack/Kicks/${name}.wav` });
      list.push(f);
    }
    const progress: string[] = [];
    const built = (await buildPackProject(findPackInFileList(list), { kitSlots: { kick: 1 }, onProgress: (t) => progress.push(t) }))!;
    const zip = await JSZip.loadAsync(await built.file.arrayBuffer());
    const json = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const peaks = await Promise.all(
      json.pads.map(async (p: any) => {
        const decoded = parseWav(await zip.file(`sampler/${p.sampleId}.wav`)!.async("arraybuffer"))!;
        return Math.max(...decoded.channelData[0].map(Math.abs));
      }),
    );
    expect(peaks[0]).toBeCloseTo(peaks[1], 2);
    expect(peaks[0]).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-3); // under the -1 dBFS ceiling
    expect(Object.values(built.knobDb)).toEqual([0, 0]); // kicks sit at 0 dB
    expect(json.pads.every((p: any) => p.vol === 1)).toBe(true);
    expect(progress.some((t) => t.startsWith("Measuring"))).toBe(true);
    expect(progress.some((t) => t.startsWith("Levelling"))).toBe(true);
  });

  it("returns null when the folder holds no audio", async () => {
    expect(await buildPackProject({ name: "empty", files: [] }, { kitSlots: KIT })).toBeNull();
  });
});

describe("adding a pack to a project", () => {
  const filesIn = (folder: string, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const f = new File([wav(2000 + i)], `${folder}-${i}.wav`);
      Object.defineProperty(f, "webkitRelativePath", { value: `Other/${folder}/${f.name}` });
      return f;
    });

  it("appends only what the gaps need, past the grid, and leaves the existing sounds alone", async () => {
    const base = (await buildPackProject(findPackInFileList(filesIn("Kicks", 3)), { kitSlots: { kick: 1 } }))!;
    const zip = await JSZip.loadAsync(await base.file.arrayBuffer());
    const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const pads = samplerJson.pads.map((p: any) => ({ pad: p.pad, sampleId: p.sampleId, fileName: `${p.sampleId}.wav` }));
    const project: ParsedKoalaProject = { zip, samplerJson, originalName: "Base.koala", pads, padBase: 0 };
    const before = await zip.file(`sampler/${pads[0].sampleId}.wav`)!.async("uint8array");
    const padsBefore = samplerJson.pads.length;

    // Two melodic slots are missing on bank B.
    const fill = fillPlan([24, 25], layoutById("horizontal"), []);
    const result = (await appendPackToProject(project, findPackInFileList(filesIn("Synths", 10)), { ...fill, existing: [] }))!;

    const forSlot = result.sounds.filter((x) => x.forSlot);
    expect(forSlot).toHaveLength(2);
    expect(forSlot.every((x) => x.category === "melodic")).toBe(true);
    expect(result.sounds.filter((x) => !x.forSlot).length).toBeGreaterThan(0); // spares for the hot-swap pool
    expect(result.sounds.every((x) => x.pad >= 64)).toBe(true);
    expect(new Set(result.sounds.map((x) => x.pad)).size).toBe(result.sounds.length);
    expect(project.samplerJson.pads).toHaveLength(padsBefore + result.sounds.length);
    // The sounds already in the project are byte for byte as they were.
    expect(await project.zip.file(`sampler/${pads[0].sampleId}.wav`)!.async("uint8array")).toEqual(before);
    // The returned file is a project with the new sounds in it.
    const reread = await JSZip.loadAsync(await result.file.arrayBuffer());
    for (const x of result.sounds) expect(reread.file(`sampler/${x.sampleId}.wav`)).not.toBeNull();
  });

  it("returns null when nothing was wanted", async () => {
    const base = (await buildPackProject(findPackInFileList(filesIn("Kicks", 2)), { kitSlots: { kick: 1 } }))!;
    const zip = await JSZip.loadAsync(await base.file.arrayBuffer());
    const samplerJson = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
    const project: ParsedKoalaProject = { zip, samplerJson, originalName: "Base.koala", pads: [], padBase: 0 };
    const fill = fillPlan([], layoutById("horizontal"), []);
    const nothing = await appendPackToProject(project, { name: "x", files: [] }, { ...fill, existing: [] });
    expect(nothing).toBeNull();
  });
});
