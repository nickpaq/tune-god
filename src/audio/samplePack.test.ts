import { describe, expect, it } from "vitest";
import { categoryOfFile, categoryOfFolder, packByteBudget, selectPackSounds, type PackFile } from "./samplePack";

// A small deterministic random source so the shuffles are repeatable.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const file = (folders: string[], name: string, size = 1000): PackFile<null> => ({ folders, name, size, source: null });

describe("classifying from folder names", () => {
  it("folds plural and loosely named folders into the existing types", () => {
    expect(categoryOfFolder("Kicks")).toBe("kick");
    expect(categoryOfFolder("Snares & Rims")).toBe("snare");
    expect(categoryOfFolder("808s")).toBe("bass");
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
    expect(categoryOfFile(["Hats"], "open_01.wav")).toBe("closedHat" /* "open" alone is no keyword */);
    expect(categoryOfFile(["Hats"], "open hat 01.wav")).toBe("openHat");
    expect(categoryOfFile(["Hats"], "hat 01.wav")).toBe("closedHat");
  });
});

describe("choosing the sounds", () => {
  const pack = [
    ...Array.from({ length: 200 }, (_, i) => file(["Kicks"], `k${i}.wav`)),
    ...Array.from({ length: 100 }, (_, i) => file(["Snares"], `s${i}.wav`)),
    ...Array.from({ length: 50 }, (_, i) => file(["Hats"], `h${i}.wav`)),
    ...Array.from({ length: 6 }, (_, i) => file(["Vocals"], `v${i}.wav`)),
  ];

  it("fills 64 pads with types as even as the pack allows, small types giving up their surplus", () => {
    const { picked, counts } = selectPackSounds(pack, { random: seeded() });
    expect(picked).toHaveLength(64);
    // Four types: 6 vocals is under the 16 share, so the other three split the remaining 58 as evenly as they can.
    expect(counts.other).toBeUndefined();
    expect(counts.vox!.picked).toBe(6);
    const rest = [counts.kick!.picked, counts.snare!.picked, counts.closedHat!.picked].sort();
    expect(rest[2] - rest[0]).toBeLessThanOrEqual(1);
    expect(rest.reduce((a, b) => a + b, 0)).toBe(58);
  });

  it("picks the same number from each of a few types and spreads the remainder", () => {
    const three = pack.filter((f) => f.folders[0] !== "Vocals");
    const { picked, counts } = selectPackSounds(three, { random: seeded(7) });
    expect(picked).toHaveLength(64);
    const n = [counts.kick!.picked, counts.snare!.picked, counts.closedHat!.picked];
    expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1);
  });

  it("scatters the types over the pads instead of grouping them", () => {
    const { picked } = selectPackSounds(pack, { random: seeded(3) });
    const firstSixteen = new Set(picked.slice(0, 16).map((p) => p.category));
    expect(firstSixteen.size).toBeGreaterThan(1);
  });

  it("takes everything when the pack is smaller than 64", () => {
    const { picked } = selectPackSounds(pack.slice(0, 5), { random: seeded() });
    expect(picked).toHaveLength(5);
  });

  it("stays inside the byte budget by passing over files that no longer fit", () => {
    const big = Array.from({ length: 80 }, (_, i) => file([i % 2 ? "Kicks" : "Snares"], `f${i}.wav`, 10 + (i % 4) * 10));
    const { picked, skippedForSize } = selectPackSounds(big, { byteBudget: 500, random: seeded() });
    const total = picked.reduce((a, p) => a + p.file.size, 0);
    expect(total).toBeLessThanOrEqual(500);
    expect(picked.length).toBeGreaterThan(10);
    expect(skippedForSize).toBeGreaterThan(0);
  });

  it("never picks a file over the per-file limit", () => {
    const files = [file(["Loops"], "huge.wav", 5000), file(["Loops"], "ok.wav", 10)];
    const { picked, skippedForSize } = selectPackSounds(files, { maxFileBytes: 1000 });
    expect(picked.map((p) => p.file.name)).toEqual(["ok.wav"]);
    expect(skippedForSize).toBe(1);
  });
});

describe("memory budget", () => {
  const MB = 1024 * 1024;
  it("is conservative on iOS and scales with device memory elsewhere", () => {
    expect(packByteBudget("low", { ios: true })).toBe(96 * MB);
    expect(packByteBudget("auto", { ios: true })).toBe(192 * MB);
    expect(packByteBudget("high", { ios: true })).toBe(384 * MB);
    expect(packByteBudget("auto", { ios: false, deviceMemoryGb: 8 })).toBe(512 * MB);
    expect(packByteBudget("auto", { ios: false, deviceMemoryGb: 1 })).toBe(128 * MB);
    expect(packByteBudget("auto", { ios: false })).toBe(192 * MB);
    expect(packByteBudget("high", { ios: false, deviceMemoryGb: 8 })).toBe(1024 * MB);
  });
});
