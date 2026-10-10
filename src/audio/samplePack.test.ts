import { describe, expect, it } from "vitest";
import { categoryOfFile, categoryOfFolder, fairPackOrder, packByteBudget } from "./samplePack";

describe("hats and effects the names only hint at", () => {
  it("reads open and closed from separate words next to a hat word", () => {
    for (const name of ["open hi-hat 3.wav", "HH Open 01.wav", "Hat_O_01.wav", "Hihat Open.wav"]) expect(categoryOfFile(["Pack"], name)).toBe("openHat");
    for (const name of ["closed hihat 2.wav", "HH_Closed_01.wav", "Hat_C_01.wav", "Hihat Closed.wav"]) expect(categoryOfFile(["Pack"], name)).toBe("closedHat");
  });

  it("splits a combined hats and cymbals folder by file name", () => {
    expect(categoryOfFolder("Hats & Cymbals")).toBe("hat");
    expect(categoryOfFile(["Hats & Cymbals"], "Crash 1.wav")).toBe("cymbal");
    expect(categoryOfFile(["Hats & Cymbals"], "Open Hat 1.wav")).toBe("openHat");
    expect(categoryOfFile(["Hats & Cymbals"], "Closed Hat 1.wav")).toBe("closedHat");
  });

  it("recognises more effect names", () => {
    for (const name of ["Zap 1.wav", "Laser_02.wav", "Siren.wav"]) expect(categoryOfFile(["Pack"], name)).toBe("fx");
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

  it("uses the nearest folder that says something, then the file name", () => {
    expect(categoryOfFile(["Drums", "Snares", "One Shots"], "x.wav")).toBe("snare");
    expect(categoryOfFile(["Pack", "Misc"], "Big Kick 3.wav")).toBe("kick");
    expect(categoryOfFile(["Pack"], "thing.wav")).toBe("other");
  });

  it("lets a hats folder's file names say open, and calls the rest closed", () => {
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
  it("defaults to 512 MB on every device, with Low and High either side", () => {
    expect(packByteBudget("auto")).toBe(512 * MB);
    expect(packByteBudget("low")).toBe(96 * MB);
    expect(packByteBudget("high")).toBe(1024 * MB);
  });
});
