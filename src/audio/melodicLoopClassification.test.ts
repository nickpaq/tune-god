import { describe, expect, it } from "vitest";
import { classifyFile, type PackFile } from "./samplePack";
import { classifySample } from "./classify";
import { CLASSIFICATION_VERSION, reclassifyLibrary, refreshLibrary, refreshLibraryAsync } from "./libraryIndex";
import { keyFromName } from "./pitch/nameKey";
import { allocateKit, generationSlots } from "./kitGeneration";
import { planKit } from "./bankLoad";
import { eligibleHotSwapSound } from "./hotSwap";

describe("keyed melodic loop rules", () => {
  it.each([
    ["Dreamy_Piano_Bm.wav", 12], ["Guitar_E#m_140.wav", 8],
    ["Ambient_B_minor.wav", 16], ["Synth_Bminor.wav", 9],
    ["Keys_F#Major.wav", 11], ["Phrase_F#maj.wav", 8],
    ["Phrase_F# major.wav", 8], ["Phrase_Db.wav", 8],
    ["Phrase_Cmin.wav", 8], ["Phrase_E♯m.wav", 8],
  ])("recognizes %s", (name, duration) => {
    expect(classifyFile([], name, undefined, duration)).toMatchObject({ category: "melodicLoop", evidence: "metadata", needsReview: false });
    expect(classifySample(new Float32Array(duration * 10), 10, name, null)).toBe("melodicLoop");
  });
  it.each(["Bass_Gm_140.wav", "subBASS_Am.wav", "Piano_Am.wav", "Piano_Am.wav"])("excludes bass and short samples: %s", name => {
    const duration = /bass/i.test(name) ? 12 : 5;
    expect(classifyFile([], name, undefined, duration).category).not.toBe("melodicLoop");
  });
  it.each(["Drum_Loop_Cm.wav", "Kick_Cm.wav", "Perc_Cm.wav", "Shaker_Bm.wav", "Vocal_Am.wav", "FX_Db.wav", "Ambient_Noise_Am.wav"])("protects explicit categories in %s", name => {
    expect(classifyFile([], name, undefined, 10).category).not.toBe("melodicLoop");
  });
  it.each(["Drum Loops", "Percussion", "Vocals", "FX"])("protects %s folders", folder => {
    expect(classifyFile([folder], "Piano_Am.wav", undefined, 10).category).not.toBe("melodicLoop");
  });
  it.each(["Amber.wav", "Dreamy.wav", "Bassoon.wav", "Cam.wav", "Amethyst.wav", "CBminor.wav", "Take_B.wav", "am_i_dm.wav"])("requires bounded key notation in %s", name => {
    expect(keyFromName(name)).toBeNull();
    expect(classifyFile([], name, undefined, 10).category).not.toBe("melodicLoop");
  });
  it("resolves separated minor qualities and preserves enharmonic pitch classes", () => {
    expect(keyFromName("Ambient_B_minor.wav")).toMatchObject({ pc: 11, minor: true });
    expect(keyFromName("Keys_F# major.wav")).toMatchObject({ pc: 6, minor: false });
    expect(keyFromName("Guitar_E#m.wav")).toMatchObject({ pc: 5, minor: true });
  });
  it("preserves manual corrections", () => {
    expect(classifyFile([], "Piano_Am.wav", { category: "fx", confidence: 1, needsReview: false, evidence: "correction" }, 10).category).toBe("fx");
  });
});

const file = (duration?: number): PackFile<null> => ({ name: "Piano_Bm.wav", folders: ["Pack", "Piano"], size: 100, lastModified: 1, source: null, duration });
it("reclassifies old indexes using stored duration and keeps corrections", () => {
  const first = refreshLibrary("Library", [file(12)]).index;
  first.classificationVersion = 1;
  first.samples[0].classification.category = "melodic";
  const upgraded = reclassifyLibrary(first);
  expect(upgraded.classificationVersion).toBe(CLASSIFICATION_VERSION);
  expect(upgraded.samples[0].classification.category).toBe("melodicLoop");
  const refreshed = refreshLibrary("Library", [file()], first);
  expect(refreshed.index.samples[0].duration).toBe(12);
  expect(refreshed.files[0].classification?.category).toBe("melodicLoop");
  expect(refreshed.reused).toBe(0);
  first.samples[0].correction = { category: "bassLoop", confidence: 1, needsReview: false, evidence: "correction" };
  expect(reclassifyLibrary(first).samples[0].classification.category).toBe("bassLoop");
});
it("reads duration only during indexing and reuses it on reconnect", async () => {
  let reads = 0;
  const read = async () => { reads++; return 12; };
  const first = await refreshLibraryAsync("Library", [file()], null, false, undefined, read);
  expect(reads).toBe(1);
  const next = await refreshLibraryAsync("Library", [file()], first.index, true, undefined, read);
  expect(reads).toBe(1);
  expect(next.files[0].duration).toBe(12);
  const changed = await refreshLibraryAsync("Library", [{ ...file(), size: file().size + 1 }], next.index, false, undefined, read);
  expect(reads).toBe(2);
  expect(changed.index.samples[0].classification.category).toBe("melodicLoop");
});
it("has eight melodic-loop slots, no bass-loop slot, and never fills melodic slots with bass loops", () => {
  const slots = generationSlots();
  expect(slots).toHaveLength(48);
  expect(slots.filter(slot => slot.category === "melodicLoop")).toHaveLength(8);
  expect(slots.some(slot => slot.category === "bassLoop")).toBe(false);
  for (const index of [16, 17, 18, 19, 32, 33, 34, 35]) expect(slots[index].category).toBe("melodicLoop");
  const bass = { ...file(12), name: "Bass_Loop_Gm.wav", folders: [] };
  expect(planKit([bass]).groups).toEqual([]);
  expect(allocateKit([{ key: 1, category: "bassLoop" }], [{ category: "melodicLoop", label: "Melodic Loop" }]).positions.size).toBe(0);
});
it("hot swap rejects other Types, unselected packs, unknown sources and locked samples", () => {
  const allowed = new Set(["selected:1", "Library/Selected/loop.wav"]);
  expect(eligibleHotSwapSound({ category: "melodicLoop", libraryId: "selected:1" }, "melodicLoop", allowed)).toBe(true);
  expect(eligibleHotSwapSound({ category: "melodicLoop", sourcePath: "Library/Selected/loop.wav" }, "melodicLoop", allowed)).toBe(true);
  for (const category of ["bassLoop", "drumLoop", "melodic", "fxLoop"] as const)
    expect(eligibleHotSwapSound({ category, libraryId: "selected:1" }, "melodicLoop", allowed)).toBe(false);
  for (const sound of [{ category: "melodicLoop" as const }, { category: "melodicLoop" as const, libraryId: "other:1" }, { category: "melodicLoop" as const, libraryId: "selected:1", locked: true }])
    expect(eligibleHotSwapSound(sound, "melodicLoop", allowed)).toBe(false);
});

it("hot swap shows only sounds of the selected packs for every Type, and everything when all packs are selected", () => {
  const allowed = new Set(["selected:1", "Library/Selected/kick.wav"]);
  expect(eligibleHotSwapSound({ category: "kick", libraryId: "selected:1" }, "kick", allowed)).toBe(true);
  expect(eligibleHotSwapSound({ category: "kick", sourcePath: "Library/Selected/kick.wav" }, "kick", allowed)).toBe(true);
  expect(eligibleHotSwapSound({ category: "kick", libraryId: "other:1" }, "kick", allowed)).toBe(false);
  expect(eligibleHotSwapSound({ category: "kick" }, "kick", allowed)).toBe(false);
  expect(eligibleHotSwapSound({ category: "kick", libraryId: "other:1" }, "kick", null)).toBe(true);
});

it("backfills duration on an already migrated legacy index before reusing classification", async () => {
  const legacy = refreshLibrary("Library", [file()]).index;
  legacy.classificationVersion = undefined;
  const restored = reclassifyLibrary(legacy);
  expect(restored.samples[0].classification.category).toBe("melodic");
  const connected = await refreshLibraryAsync("Library", [file()], restored, false, undefined, async () => 12);
  expect(connected.index.samples[0].classification.category).toBe("melodicLoop");
  expect(connected.reused).toBe(0);
});
