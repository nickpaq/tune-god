import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { acapellaProjectFromAudio } from "./packProject";
import { encodeWav } from "./wavEncode";

const wav = async (name: string) => new File([await encodeWav({ sampleRate: 44100, channelData: [new Float32Array(441).fill(0.1)], bitDepth: 24 }).arrayBuffer()], name);

describe("acapella mode from two audio files", () => {
  it("puts the song on pad 48 and its stem, labelled like the song plus VOCALS, on pad 49", async () => {
    const made = await acapellaProjectFromAudio([await wav("Night Drive vocals.wav"), await wav("Night Drive.wav")]);
    if ("problem" in made) throw new Error(made.problem);
    const zip = await JSZip.loadAsync(await made.file.arrayBuffer());
    const pads = JSON.parse(await zip.file("sampler/sampler.json")!.async("string")).pads;
    // Koala numbers its pads from 1 when none is 0, so pads 49 and 50 are slots 48 and 49
    expect(pads.map((p: any) => p.pad)).toEqual([49, 50]);
    expect(pads.map((p: any) => p.label)).toEqual(["Night Drive", "Night Drive VOCALS"]);
    expect(zip.file("sampler/1.wav")).toBeTruthy();
    expect(zip.file("sampler/2.wav")).toBeTruthy();
  });

  it("says what is wrong when there are not two files or the stem cannot be told", async () => {
    expect("problem" in (await acapellaProjectFromAudio([await wav("a.wav")]))).toBe(true);
    expect("problem" in (await acapellaProjectFromAudio([await wav("a.wav"), await wav("b.wav")]))).toBe(true);
  });
});
