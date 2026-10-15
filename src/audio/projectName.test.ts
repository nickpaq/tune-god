import { describe, expect, it } from "vitest";
import { candidateNames, MAX_USED_NAMES, pickProjectName, rememberName } from "./projectName";

const files = ["EUD_140_808_askari_Em.wav", "Library/Pack/Cheeky Piano Loop 120bpm Am.wav", "Kick 1.wav", "Snare 2.wav", "Hat.wav", "Bell Melody Dreamer 90 BPM.wav", "07.wav", "x.wav"];

describe("candidateNames", () => {
  it("takes the readable name out of real sample file names and nothing else", () => {
    const names = candidateNames(files);
    expect(names).toContain("Askari");
    for (const name of names) {
      const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
      expect(files.some((f) => squash(f).includes(squash(name))), name).toBe(true);
    }
  });
  it("skips names with no real word in them: type words, numbers, one letter", () => {
    const names = candidateNames(["Kick 1.wav", "Snare 2.wav", "07.wav", "x.wav", "Hat.wav"]);
    expect(names).toEqual([]);
  });
  it("never suggests a name with digits or underscores", () => {
    expect(candidateNames(["Askari2_Em.wav", "Lo_Fi_Dream.wav", "Night808Owl.wav"]).every((n) => /^[A-Za-z ]+$/.test(n))).toBe(true);
  });
  it("lists each name once", () => {
    expect(candidateNames(["Askari_Em.wav", "ASKARI 140.wav", "askari.wav"])).toHaveLength(1);
  });
});

describe("pickProjectName", () => {
  it("picks a name from the samples that has not been used, whatever its case or punctuation", () => {
    const names = candidateNames(files);
    const used = names.slice(1).map((n) => n.toUpperCase().replace(/ /g, "-"));
    expect(pickProjectName(files, used, () => 0.99)).toBe(names[0]);
  });
  it("opens the whole list again once every name has been used, and gives null when no sample has a name", () => {
    const names = candidateNames(files);
    expect(names).toContain(pickProjectName(files, names, () => 0)!);
    expect(pickProjectName(["Kick 1.wav", "07.wav"], [])).toBeNull();
  });
  it("is random across the unused names", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickProjectName(files, [])!);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("rememberName", () => {
  it("keeps a name once, newest last, and no more than the limit", () => {
    expect(rememberName(["A b", "C"], "a-b")).toEqual(["C", "a-b"]);
    const many = Array.from({ length: MAX_USED_NAMES + 5 }, (_, i) => `name${i}`);
    expect(rememberName(many, "last")).toHaveLength(MAX_USED_NAMES);
    expect(rememberName(many, "last").at(-1)).toBe("last");
  });
});
