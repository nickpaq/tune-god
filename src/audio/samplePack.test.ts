import { describe, expect, it } from "vitest";
import { categoryOfFile, categoryOfFolder, fairPackOrder, packByteBudget } from "./samplePack";

describe("folder-only classification", () => {
  it("ignores misleading filenames in every folder", () => {
    for (const name of ["open hi-hat.wav", "Big Kick.wav", "Piano.wav", "Siren.wav"]) {
      expect(categoryOfFile(["Pack"], name)).toBe("other");
      expect(categoryOfFile(["Percussion"], name)).toBe("perc");
      expect(categoryOfFile(["Hats"], name)).toBe("closedHat");
    }
  });
  it("keeps bells and percussion out of melodic one shots", () => {
    expect(categoryOfFile(["One Shots", "Bells"], "Piano.wav")).toBe("perc");
    expect(categoryOfFile(["Melodic", "Percussion"], "Synth.wav")).toBe("perc");
    expect(categoryOfFile(["Melodic", "Misc"], "Kick.wav")).toBe("other");
    expect(categoryOfFile(["One Shots"], "Piano.wav")).toBe("other");
  });
});

describe("classifying from folder names", () => {
  it("folds plural and loosely named folders into the existing types", () => {
    expect(categoryOfFolder("Kicks")).toBe("kick");
    expect(categoryOfFolder("Snares & Rims")).toBe("snare");
    expect(categoryOfFolder("808s")).toBe("bass");
    expect(categoryOfFolder("808")).toBe("bass");
    expect(categoryOfFolder("Claps")).toBe("clap");
    expect(categoryOfFolder("Open Hats")).toBe("openHat");
    expect(categoryOfFolder("Closed_HiHats")).toBe("closedHat");
    expect(categoryOfFolder("Toms")).toBe("perc");
    expect(categoryOfFolder("Crashes")).toBe("cymbal");
    expect(categoryOfFolder("Vocal Chops")).toBe("vox");
    expect(categoryOfFolder("Risers and FX")).toBe("fx");
    expect(categoryOfFolder("Synth Leads")).toBe("melodic");
    expect(categoryOfFolder("Perc Loops")).toBe("percLoop");
    expect(categoryOfFolder("Drum Loops")).toBe("drumLoop");
    expect(categoryOfFolder("Bass Loops")).toBe("melodicLoop");
    expect(categoryOfFolder("Loops")).toBe("drumLoop");
  });

  it("ignores folders that only group files", () => {
    expect(categoryOfFolder("One Shots")).toBeNull();
    expect(categoryOfFolder("Drums")).toBeNull();
    expect(categoryOfFolder("01")).toBeNull();
  });

  it("uses the nearest typed folder without a filename fallback", () => {
    expect(categoryOfFile(["Drums", "Snares", "One Shots"], "x.wav")).toBe("snare");
    expect(categoryOfFile(["Pack", "Misc"], "Big Kick 3.wav")).toBe("other");
    expect(categoryOfFile(["Pack"], "thing.wav")).toBe("other");
  });

  it("defaults generic hats to closed, regardless of the filename", () => {
    expect(categoryOfFile(["Hats"], "open_01.wav")).toBe("closedHat");
    expect(categoryOfFile(["Hats"], "open hat 01.wav")).toBe("closedHat");
    expect(categoryOfFile(["Hats"], "hat 01.wav")).toBe("closedHat");
  });
});

describe("balanced kit selection", () => {
  it("alternates source packs before taking more samples from a larger pack", () => {
    const files = [
      ...Array.from({ length: 12 }, (_, i) => ({ folders: ["Large Pack", "Kicks"], name: `kick-${i}.wav`, size: 1, source: null })),
      ...Array.from({ length: 2 }, (_, i) => ({ folders: ["Small Pack", "Kicks"], name: `kick-${i}.wav`, size: 1, source: null })),
    ];
    const chosen = fairPackOrder(files, () => 0.5).slice(0, 8);
    const counts = chosen.reduce((map, file) => map.set(file.folders[0], (map.get(file.folders[0]) ?? 0) + 1), new Map<string, number>());
    expect(counts.get("Small Pack")).toBe(2);
    expect(counts.get("Large Pack")).toBe(6);
  });
});

describe("project size limit", () => {
  const MB = 1024 * 1024;
  it("defaults to 512 MB on every device, with Low and High either side", () => {
    expect(packByteBudget("auto")).toBe(512 * MB);
    expect(packByteBudget("low")).toBe(96 * MB);
    expect(packByteBudget("high")).toBe(1024 * MB);
  });
});
