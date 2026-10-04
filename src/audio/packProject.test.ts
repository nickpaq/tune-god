import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildPackProject, findPackInFileList } from "./packProject";
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
    // One sound per kit slot on the pads, and four spares per type numbered past the grid so they sit on no pad.
    expect(json.pads.map((p: any) => p.pad)).toEqual([0, 1, 2, ...Array.from({ length: 12 }, (_, i) => 64 + i)]);
    for (const p of json.pads) expect(zip.file(`sampler/${p.sampleId}.wav`)).not.toBeNull();

    const shown = Object.entries(built.categories).filter(([pad]) => Number(pad) < 64).map(([, c]) => c).sort();
    expect(shown).toEqual(["closedHat", "kick", "snare"]);
    const spare = Object.entries(built.categories).filter(([pad]) => Number(pad) >= 64).map(([, c]) => c);
    for (const c of ["closedHat", "kick", "snare"]) expect(spare.filter((s) => s === c)).toHaveLength(4);
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
