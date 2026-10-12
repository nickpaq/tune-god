import { describe, expect, it } from "vitest";
import { categoryOfFile, categoryOfFolder, fairPackOrder, packByteBudget, projectNameForFiles } from "./samplePack";

describe("hierarchy and filename classification", () => {
  it("uses names in untyped folders and respects explicit typed folders", () => {
    expect(categoryOfFile(["Pack"], "open hi-hat.wav")).toBe("openHat");
    expect(categoryOfFile(["Pack"], "Big Kick.wav")).toBe("kick");
    expect(categoryOfFile(["Percussion"], "Piano.wav")).toBe("perc");
    expect(categoryOfFile(["Hats"], "open hat.wav")).toBe("openHat");
  });
  it("uses all ancestors and falls back to names through generic folders", () => {
    expect(categoryOfFile(["One Shots", "Bells"], "Piano.wav")).toBe("perc");
    expect(categoryOfFile(["Melodic", "Percussion"], "Synth.wav")).toBe("perc");
    expect(categoryOfFile(["Melodic", "Misc"], "Kick.wav")).toBe("melodic");
    expect(categoryOfFile(["One Shots"], "Piano.wav")).toBe("melodic");
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
    expect(categoryOfFolder("Bass Loops")).toBe("bassLoop");
    expect(categoryOfFolder("Loops")).toBeNull();
  });

  it("ignores folders that only group files", () => {
    expect(categoryOfFolder("One Shots")).toBeNull();
    expect(categoryOfFolder("Drums")).toBeNull();
    expect(categoryOfFolder("01")).toBeNull();
  });

  it("uses the nearest typed folder with a filename fallback", () => {
    expect(categoryOfFile(["Drums", "Snares", "One Shots"], "x.wav")).toBe("snare");
    expect(categoryOfFile(["Pack", "Misc"], "Big Kick 3.wav")).toBe("kick");
    expect(categoryOfFile(["Pack"], "thing.wav")).toBe("other");
  });

  it("refines generic hats by filename, defaulting to closed", () => {
    expect(categoryOfFile(["Hats"], "open_01.wav")).toBe("openHat");
    expect(categoryOfFile(["Hats"], "open hat 01.wav")).toBe("openHat");
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
  it("caps every setting at 512 MB, including saved legacy High settings", () => {
    expect(packByteBudget("auto")).toBe(512 * MB);
    expect(packByteBudget("low")).toBe(96 * MB);
    expect(packByteBudget("high")).toBe(512 * MB);
  });
});

describe("projectNameForFiles", () => {
  const f = (rootFolder: string | undefined, ...folders: string[]) => ({ rootFolder, folders });
  it("names a whole library", () => {
    expect(projectNameForFiles([f("Samples", "Cool Pack", "Kicks"), f("Samples", "Other Pack", "Snares"), f("Samples", "Third Pack")])).toBe("TuneGod - All Kits");
  });
  it("names one pack after its folder", () => {
    expect(projectNameForFiles([f("Cool Pack", "Kicks"), f("Cool Pack", "Snares"), f("Cool Pack", "Melodic Loops")])).toBe("TuneGod - Cool Pack");
    expect(projectNameForFiles([f("Flat Pack")])).toBe("TuneGod - Flat Pack");
  });
  it("lets the first of several dropped folders name the project", () => {
    expect(projectNameForFiles([f(undefined, "First Pack", "Kicks"), f(undefined, "Second Pack", "Kicks")])).toBe("TuneGod - First Pack");
  });
});
