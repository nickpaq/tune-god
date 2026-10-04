import { describe, expect, it } from "vitest";
import { categoryOfFile, categoryOfFolder, packByteBudget, planPackSounds, type PackFile } from "./samplePack";

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

describe("planning the sounds", () => {
  const KIT = { kick: 1, snare: 1, clap: 1, closedHat: 1, openHat: 1, cymbal: 2, perc: 4, fx: 2, vox: 1 };
  const many = (folder: string, n: number, size = 1000) => Array.from({ length: n }, (_, i) => file([folder], `${folder}${i}.wav`, size));
  const pack = [
    ...many("Kicks", 30), ...many("Snares", 30), ...many("Claps", 30), ...many("Closed Hats", 30), ...many("Open Hats", 30),
    ...many("Cymbals", 30), ...many("Percussion", 30), ...many("FX", 30), ...many("Vocals", 30),
    ...many("Bass", 30), ...many("Synths", 30), ...many("Drum Loops", 30), ...many("Melodic Loops", 30),
  ];
  const tally = (list: { category: string }[]) => list.reduce<Record<string, number>>((n, s) => ({ ...n, [s.category]: (n[s.category] ?? 0) + 1 }), {});

  it("puts one sound per kit slot on the pads and holds four alternatives of each kit type back, hidden", () => {
    const { visible, hidden } = planPackSounds(pack, { kitSlots: KIT, random: seeded() });
    const shown = tally(visible);
    const spare = tally(hidden);
    for (const [category, slots] of Object.entries(KIT)) {
      expect(shown[category]).toBe(slots);
      expect(spare[category]).toBe(4);
    }
    // No file is both on a pad and a hidden spare.
    const names = [...visible, ...hidden].map((s) => s.file.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("shares the rest of the pads evenly between the other types, each with four hidden alternatives", () => {
    const { visible, hidden } = planPackSounds(pack, { kitSlots: KIT, random: seeded(5) });
    const others = ["bass", "melodic", "drumLoop", "melodicLoop"];
    const shown = tally(visible.filter((s) => others.includes(s.category)));
    const counts = others.map((c) => shown[c]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(64 - 16);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    for (const c of others) expect(tally(hidden)[c]).toBe(4);
    expect(visible.length).toBeLessThanOrEqual(64);
  });

  it("keeps alternatives back for a small type instead of putting every file on a pad", () => {
    const { visible, hidden } = planPackSounds([...many("Bass", 10), ...many("Synths", 10)], { kitSlots: KIT, random: seeded() });
    expect(tally(visible).bass).toBe(6);
    expect(tally(hidden).bass).toBe(4);
    expect(tally(visible).melodic).toBe(6);
  });

  it("gives a small type only what it has, and the kit still gets its alternatives first", () => {
    const small = [...many("Kicks", 3), ...many("Snares", 20), ...many("Bass", 100)];
    const { visible, hidden } = planPackSounds(small, { kitSlots: KIT, random: seeded() });
    expect(tally(visible).kick).toBe(1);
    expect(tally(hidden).kick).toBe(2); // only three kicks exist: one shown, two spare
    expect(tally(visible).bass).toBe(48);
  });

  it("spends a tight byte budget on the kit before bass, and bass before loops", () => {
    const sized = [...many("Kicks", 10, 100), ...many("Snares", 10, 100), ...many("Bass", 10, 100), ...many("Drum Loops", 10, 100)];
    const { visible, hidden } = planPackSounds(sized, { kitSlots: { kick: 1, snare: 1 }, byteBudget: 1000, maxFileBytes: 1000, random: seeded() });
    const all = [...visible, ...hidden];
    expect(all.reduce((n, s) => n + s.file.size, 0)).toBeLessThanOrEqual(1000);
    const t = tally(all);
    expect(t.kick).toBe(5); // 1 shown + 4 spare
    expect(t.snare).toBe(5);
    expect(t.drumLoop ?? 0).toBe(0);
  });

  it("scatters the visible sounds and never picks a file over the per-file limit", () => {
    const files = [file(["Loops"], "huge.wav", 5000), file(["Loops"], "ok.wav", 10)];
    const { visible, hidden, skippedForSize } = planPackSounds(files, { kitSlots: KIT, maxFileBytes: 1000 });
    expect([...visible, ...hidden].map((p) => p.file.name)).toEqual(["ok.wav"]);
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
