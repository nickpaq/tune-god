import { describe, expect, it } from "vitest";
import { categoryOfFile, categoryOfFolder, isOneShotFolder, packByteBudget, packHasMelodicOneShots, planPackSounds, type PackFile } from "./samplePack";

// A small deterministic random source so the shuffles are repeatable.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const file = (folders: string[], name: string, size = 1000): PackFile<null> => ({ folders, name, size, source: null });

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

describe("planning the sounds", () => {
  const KIT = { kick: 1, snare: 1, clap: 1, closedHat: 1, openHat: 1, cymbal: 2, perc: 4, fx: 2, vox: 1 };
  const many = (folder: string, n: number, size = 1000) => Array.from({ length: n }, (_, i) => file([folder], `${folder}${i}.wav`, size));
  const pack = [
    ...many("Kicks", 30), ...many("Snares", 30), ...many("Claps", 30), ...many("Closed Hats", 30), ...many("Open Hats", 30),
    ...many("Cymbals", 30), ...many("Percussion", 30), ...many("FX", 30), ...many("Vocals", 30),
    ...many("Bass", 30), ...many("Synths", 30), ...many("Drum Loops", 30), ...many("Melodic Loops", 30),
  ];
  const tally = (list: { category: string }[]) => list.reduce<Record<string, number>>((n, s) => ({ ...n, [s.category]: (n[s.category] ?? 0) + 1 }), {});

  it("puts one sound per kit slot on the pads and holds ten alternatives of each kit type back, hidden", () => {
    const { visible, hidden } = planPackSounds(pack, { kitSlots: KIT, random: seeded() });
    const shown = tally(visible);
    const spare = tally(hidden);
    for (const [category, slots] of Object.entries(KIT)) {
      expect(shown[category]).toBe(slots);
      expect(spare[category]).toBe(10);
    }
    // No file is both on a pad and a hidden spare.
    const names = [...visible, ...hidden].map((s) => s.file.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("plans bank B as eight melodic loops and eight melodics, and bank C as two basses, two 808s and twelve of everything else", () => {
    const files = [
      ...pack.filter((f) => f.folders[0] !== "Bass" && f.folders[0] !== "Drum Loops"),
      ...many("Bass", 30), ...many("808s", 30), ...many("Drum Loops", 30), ...many("Perc Loops", 30), ...many("Misc", 30),
    ];
    const { visible, hidden } = planPackSounds(files, { kitSlots: KIT, random: seeded(5) });
    const shown = tally(visible);
    expect(shown.melodicLoop).toBe(8);
    expect(shown.melodic).toBe(8);
    expect(shown.bass).toBe(4);
    expect(visible.filter((v) => v.category === "bass" && v.is808)).toHaveLength(2);
    expect(visible.filter((v) => v.category === "bass" && !v.is808)).toHaveLength(2);
    // The other twelve are shared between drum loops, perc loops and other.
    const rest = ["drumLoop", "percLoop", "other"].map((c) => shown[c]);
    expect(rest.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.max(...rest) - Math.min(...rest)).toBeLessThanOrEqual(1);
    for (const c of ["melodicLoop", "melodic", "bass", "drumLoop", "percLoop"]) expect(tally(hidden)[c]).toBeGreaterThanOrEqual(4);
    // 14 kit pads + 8 + 8 + 4 + 12: nothing for bank D.
    expect(visible).toHaveLength(14 + 8 + 8 + 4 + 12);
  });

  it("knows an 808 by its name or its folder", () => {
    const files = [file(["808s"], "thing.wav"), file(["Bass"], "Big 808 Sub.wav"), file(["Bass"], "Reese.wav")];
    const { visible } = planPackSounds(files, { kitSlots: {}, random: seeded() });
    expect(visible.filter((v) => v.is808).map((v) => v.file.name).sort()).toEqual(["Big 808 Sub.wav", "thing.wav"]);
  });

  it("makes up a shortage of one bass kind from the other", () => {
    const { visible } = planPackSounds([...many("Bass", 20)], { kitSlots: {}, random: seeded() });
    expect(tally(visible).bass).toBe(4);
    expect(visible.some((v) => v.is808)).toBe(false);
  });

  it("leaves bank B's loop pads short rather than filling them with something else when loops are too big to load", () => {
    const files = [...many("Kicks", 3), ...many("Melodic Loops", 20, 5000), ...many("Synths", 20)];
    const { visible } = planPackSounds(files, { kitSlots: KIT, maxFileBytes: 1000, random: seeded() });
    expect(tally(visible).melodicLoop).toBeUndefined();
    expect(tally(visible).melodic).toBe(8);
  });

  it("keeps alternatives back for a small type instead of putting every file on a pad", () => {
    const { visible, hidden } = planPackSounds([...many("Percussion Loops", 10), ...many("Misc", 10)], { kitSlots: KIT, random: seeded() });
    // Bank C's twelve rest pads are shared; each type sets four files aside as spares.
    expect(tally(visible).percLoop).toBe(6);
    expect(tally(hidden).percLoop).toBe(4);
    expect(tally(visible).other).toBe(6);
  });

  it("gives a small type only what it has, and the kit still gets its alternatives first", () => {
    const small = [...many("Kicks", 3), ...many("Snares", 20), ...many("Synths", 100)];
    const { visible, hidden } = planPackSounds(small, { kitSlots: KIT, random: seeded() });
    expect(tally(visible).kick).toBe(1);
    expect(tally(hidden).kick).toBe(2); // only three kicks exist: one shown, two spare
    expect(tally(visible).melodic).toBe(8); // bank B's eight
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

describe("melodic one-shots are not mistaken for percussion", () => {
  it("keeps a pitched sound melodic when its name or folder also says perc", () => {
    for (const name of ["Rio - Bell Perc 01.wav", "Pluck Perc.wav", "Perc Synth C.wav", "Marimba Perc.wav", "Melodic Perc 03.wav"]) expect(categoryOfFile(["Pack"], name), name).toBe("melodic");
    for (const folder of ["Melodic Percussion", "Bells & Perc", "Pitched Percussion", "Tonal Percs"]) expect(categoryOfFolder(folder), folder).toBe("melodic");
  });

  it("still calls real percussion perc", () => {
    for (const name of ["Perc 01.wav", "Percussion Hit.wav", "Tom Low.wav", "Shaker 2.wav", "Conga Open.wav", "Drum Fill.wav"]) expect(categoryOfFile(["Pack"], name), name).toBe("perc");
    for (const folder of ["Percussion", "Percs", "Toms", "Shakers & Tambourines"]) expect(categoryOfFolder(folder), folder).toBe("perc");
  });

  it("knows a one-shots folder that names no type", () => {
    expect(isOneShotFolder("One Shots")).toBe(true);
    expect(isOneShotFolder("Drum One Shots")).toBe(true);
    expect(isOneShotFolder("Kick One Shots")).toBe(false);
    expect(isOneShotFolder("Melodic One Shots")).toBe(false);
    expect(isOneShotFolder("Kicks")).toBe(false);
  });

  it("allows melodic one-shots only where the pack has a melodic or one-shots folder", () => {
    expect(packHasMelodicOneShots([file(["Kicks"], "a.wav"), file(["Snares"], "b.wav")])).toBe(false);
    expect(packHasMelodicOneShots([file(["Melodic Loops"], "a.wav"), file(["Kicks"], "b.wav")])).toBe(false); // loops are not one-shots
    expect(packHasMelodicOneShots([file(["Kicks"], "a.wav"), file(["Keys"], "b.wav")])).toBe(true);
    expect(packHasMelodicOneShots([file(["One Shots"], "a.wav")])).toBe(true);
    expect(packHasMelodicOneShots([file(["Melodic One Shots"], "a.wav")])).toBe(true);
  });

  it("leaves the melodic pads empty when the pack has no melodic folder, however a file is named", () => {
    const files = [
      ...Array.from({ length: 6 }, (_, i) => file(["Kicks"], `Kick ${i}.wav`)),
      file([], "Bell Perc 01.wav"),
      file([], "Pluck 02.wav"),
      ...Array.from({ length: 4 }, (_, i) => file(["Percs"], `Perc ${i}.wav`)),
    ];
    const plan = planPackSounds(files, { kitSlots: { kick: 2, perc: 4 }, random: seeded(3) });
    expect([...plan.visible, ...plan.hidden].some((p) => p.category === "melodic")).toBe(false);
    expect(plan.skippedMelodicNames).toBe(2);
  });

  it("fills the melodic pads when the pack has a melodic folder", () => {
    const files = [...Array.from({ length: 6 }, (_, i) => file(["Kicks"], `Kick ${i}.wav`)), ...Array.from({ length: 10 }, (_, i) => file(["Keys"], `Rio - Bell Perc ${i}.wav`))];
    const plan = planPackSounds(files, { kitSlots: { kick: 2 }, random: seeded(3) });
    expect(plan.visible.filter((p) => p.category === "melodic").length).toBeGreaterThan(0);
    expect(plan.skippedMelodicNames).toBe(0);
  });

  it("lets names decide inside a plain one-shots folder", () => {
    const files = [file(["One Shots"], "Kick 1.wav"), file(["One Shots"], "Bell Perc 01.wav"), file(["One Shots"], "Pluck 02.wav")];
    const plan = planPackSounds(files, { kitSlots: { kick: 1 }, random: seeded(3) });
    expect([...plan.visible, ...plan.hidden].filter((p) => p.category === "melodic").length).toBe(2);
  });
});
