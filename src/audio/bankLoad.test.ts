import { describe, expect, it } from "vitest";
import { bankFileName, BANK_ZONES, fillKitGaps, numberedLabel, parseBankName, placeBank, planBank, planBass, planDrums, planLoops, planOneShots, type PlacedSound } from "./bankLoad";
import { FINGER_LAYOUTS } from "./fingerLayouts";
import type { PackFile } from "./samplePack";

const file = (folders: string[], name: string, size = 1000): PackFile<null> => ({ folders, name, size, source: null });
const many = (folders: string[], n: number, prefix = "s") => Array.from({ length: n }, (_, i) => file(folders, `${prefix}${i}.wav`));
const horizontal = FINGER_LAYOUTS[0];

describe("Bank A: drums by subfolder name", () => {
  const pack = [
    ...many(["Drums", "Kicks"], 14, "weird"),
    ...many(["Snares"], 12),
    ...many(["Hats", "Closed Hats"], 8),
    ...many(["Hats", "Open Hats"], 8),
    ...many(["Claps"], 7),
    ...many(["Percussion"], 9),
    ...many(["Loops", "Drum Loops"], 3),
    ...many(["808s"], 5),
    file([], "kick on the root.wav"),
    file(["Misc"], "snare by name only.wav"),
  ];

  it("pulls ten kicks, ten snares, five of each hat and five of every other drum type it finds", () => {
    const plan = planDrums(pack);
    const want = Object.fromEntries(plan.groups.map((g) => [g.category, g.want]));
    expect(want).toEqual({ kick: 10, snare: 10, closedHat: 5, openHat: 5, clap: 5, perc: 5 });
  });

  it("goes by the subfolder, not the file name, and leaves loops, 808s and unsorted files out", () => {
    const plan = planDrums(pack);
    const files = plan.groups.flatMap((g) => g.candidates);
    expect(files.some((f) => f.name.includes("root") || f.name.includes("by name only"))).toBe(false);
    expect(files.some((f) => f.folders.includes("808s") || f.folders.includes("Drum Loops"))).toBe(false);
    expect(plan.groups.find((g) => g.category === "kick")!.candidates.every((f) => f.folders.includes("Kicks"))).toBe(true);
  });

  it("explains itself when there are no drum subfolders", () => {
    expect(planDrums(many([], 5)).problem).toMatch(/subfolders/);
  });
});

describe("Bank B: 808 and bass", () => {
  it("takes 808 and bass subfolders, two pads of each plus spares", () => {
    const plan = planBass([...many(["808s"], 9), ...many(["Bass"], 3), ...many(["Kicks"], 4)]);
    const eights = plan.groups.find((g) => g.is808)!;
    const plain = plan.groups.find((g) => !g.is808)!;
    expect(eights.candidates).toHaveLength(9);
    expect(plain.candidates).toHaveLength(3);
    expect(eights.want).toBe(6);
    expect(plan.groups.every((g) => g.category === "bass")).toBe(true);
  });

  it("asks for a folder with 808 or bass subfolders when there are none", () => {
    expect(planBass(many(["Kicks"], 3)).problem).toMatch(/808 or bass/);
  });
});

describe("Banks B and C: a folder of sound files only", () => {
  it("refuses a folder with subfolders and takes any file of a flat one", () => {
    expect(planLoops([...many([], 5), ...many(["Sub"], 2)]).problem).toMatch(/subfolders/);
    expect(planOneShots(many(["x"], 3)).problem).toMatch(/subfolders/);
    const loops = planLoops(many([], 40));
    expect(loops.groups).toHaveLength(1);
    expect(loops.groups[0]).toMatchObject({ category: "melodicLoop", want: 16 });
    expect(planOneShots(many([], 40)).groups[0]).toMatchObject({ category: "melodic", want: 20 });
  });

  it("shuffles with the random source it is given", () => {
    const files = many([], 30);
    expect(planBank("loops", files, () => 0.1).groups[0].candidates.map((f) => f.name)).toEqual(planBank("loops", files, () => 0.1).groups[0].candidates.map((f) => f.name));
    expect(planBank("oneShots", [], () => 0.5).problem).toMatch(/No audio/);
  });
});

describe("numbered names", () => {
  it("names sounds by type and number, and reads them back", () => {
    expect(bankFileName("kick", 3)).toBe("Kick 3.wav");
    expect(bankFileName("bass", 1, true)).toBe("808 1.wav");
    expect(bankFileName("bass", 2)).toBe("Bass 2.wav");
    expect(parseBankName("Open Hat 4.wav")).toMatchObject({ category: "openHat", number: 4, label: "Open Hat 4", caption: "Open 4" });
    expect(parseBankName("808 2.wav")).toMatchObject({ category: "bass", is808: true });
    expect(parseBankName("Luxury Clap.wav")).toBeNull();
  });

  it("labels a pad by its number only while it is still the type its name says", () => {
    expect(numberedLabel({ name: "Snare 2.wav", category: "snare" })?.label).toBe("Snare 2");
    expect(numberedLabel({ name: "Snare 2.wav", category: "clap" })).toBeUndefined();
  });
});

describe("placing the sounds", () => {
  const sounds = (category: PlacedSound["category"], n: number, is808?: boolean, from = 0): PlacedSound[] => Array.from({ length: n }, (_, i) => ({ key: from + i, category, is808 }));

  it("puts twelve loops on the top three rows of bank B and keeps the rest as spares", () => {
    const p = placeBank("loops", sounds("melodicLoop", 16), horizontal);
    expect([...p.positions.values()]).toEqual(Array.from({ length: 12 }, (_, i) => 16 + i));
    expect(p.spares).toEqual([12, 13, 14, 15]);
  });

  it("puts two basses then two 808s on the bottom row, making up a shortage from the other kind", () => {
    const p = placeBank("bass", [...sounds("bass", 3), ...sounds("bass", 3, true, 10)], horizontal);
    expect([p.positions.get(0), p.positions.get(1), p.positions.get(10), p.positions.get(11)]).toEqual([28, 29, 30, 31]);
    expect(p.spares).toHaveLength(2);
    const only808 = placeBank("bass", sounds("bass", 5, true), horizontal);
    expect([...only808.positions.values()].sort((a, b) => a - b)).toEqual([28, 29, 30, 31]);
  });

  it("puts sixteen one-shots on bank C", () => {
    const p = placeBank("oneShots", sounds("melodic", 20), horizontal);
    expect(Math.min(...p.positions.values())).toBe(32);
    expect(Math.max(...p.positions.values())).toBe(47);
    expect(p.spares).toHaveLength(4);
  });

  it("fills the kit layout on bank A only, with the leftover drums as spares and a placeholder for a gap", () => {
    const kit = [...sounds("kick", 10), ...sounds("snare", 10, false, 100), ...sounds("closedHat", 5, false, 200), ...sounds("openHat", 5, false, 300)];
    const p = placeBank("drums", kit, horizontal);
    expect([...p.positions.values()].every((i) => i < 16)).toBe(true);
    expect(p.spares.length).toBeGreaterThan(20);
    expect(p.placeholders.every((ph) => ph.index < 16 && ph.kind === "missing")).toBe(true);
    expect(p.placeholders.length).toBeGreaterThan(0); // no cymbals, perc or FX in this kit
    expect(p.ghosts.length).toBe(2);
    expect(BANK_ZONES.drums).toEqual({ start: 0, end: 16 });
  });

  it("fills kit gaps from spares of the same type, then the same family", () => {
    const pads = { 12: undefined, 13: { placeholder: true } } as Record<number, { placeholder?: unknown } | undefined>;
    const filled = fillKitGaps(pads, horizontal, [{ category: "clap" }, { category: "kick" }, { category: "snare" }]);
    expect(filled.get(12)).toBe(1); // kick slot takes the kick
    expect(filled.get(13)).toBe(2); // snare slot takes the snare
  });
});
