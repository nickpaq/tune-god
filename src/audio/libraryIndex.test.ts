import { describe, expect, it } from "vitest";
import { correctSample, libraryPacks, refreshLibrary, refreshLibraryAsync } from "./libraryIndex";
import { classifyFile, type PackFile } from "./samplePack";
import { validTypeSelection } from "./sampleClassification";
const file = (path: string, lastModified = 1): PackFile<null> => {
  const parts = path.split("/");
  return {
    sourcePath: path,
    rootFolder: parts[0],
    folders: parts.slice(1, -1),
    name: parts.at(-1)!,
    size: 100,
    lastModified,
    source: null,
  };
};

describe("persistent library metadata", () => {
  it("distinguishes nested packs from organizational and Type folders", () => {
    const indexed = refreshLibrary("Library", [
      file("Library/Vendor/Pack A/Kicks/kick.wav"),
      file("Library/Vendor/Pack A/Hats/open.wav"),
      file("Library/Vendor/Pack B/One Shots/piano.wav"),
      file("Library/Vendor/Pack A/Unknown/mystery.wav"),
    ]);
    expect(libraryPacks(indexed.index).map((p) => p.id)).toEqual([
      "Vendor/Pack A",
      "Vendor/Pack B",
    ]);
    expect(indexed.index.samples[0].path).toBe(
      "Library/Vendor/Pack A/Kicks/kick.wav",
    );
    expect(indexed.index.samples[1].classification.category).toBe("openHat");
    expect(
      indexed.index.samples.every(
        (sample) => !("source" in sample) && !("audio" in sample),
      ),
    ).toBe(true);
  });
  it("reuses unchanged entries, refreshes changed files, removes missing files, and retains corrections", () => {
    const files = [
      file("Library/Pack/FX/fall_noise.wav"),
      file("Library/Pack/unknown.wav"),
    ];
    const first = refreshLibrary("Library", files);
    expect(first.index.samples[1].classification.needsReview).toBe(true);
    const corrected = correctSample(first.index, first.index.samples[1].id, {
      category: "melodic",
      confidence: 0,
      needsReview: true,
      evidence: "unknown",
    });
    expect(refreshLibrary("Library", files, corrected).reused).toBe(2);
    const refreshed = refreshLibrary(
      "Library",
      [file(files[1].sourcePath!, 2)],
      corrected,
      true,
    );
    expect(refreshed.index.samples).toHaveLength(1);
    expect(refreshed.index.samples[0].classification).toMatchObject({
      category: "melodic",
      confidence: 1,
      evidence: "correction",
      needsReview: false,
    });
    expect(refreshed.files[0].libraryId).toBe(first.index.samples[1].id);
    expect(refreshLibrary("Different", files, corrected).reused).toBe(0);
  });
  it("recognizes loop families, inherited loop folders, aliases without subtype fields", () => {
    expect(classifyFile(["Loops", "Bass", "808"], "take.wav")).toMatchObject({
      category: "bassLoop",
    });
    expect(classifyFile(["Vocal Loops"], "phrase.wav").category).toBe(
      "voxLoop",
    );
    expect(classifyFile(["FX Loops"], "glitch.wav").category).toBe("fxLoop");
    expect(classifyFile(["Snares"], "sidestick.wav").category).toBe("snare");
    expect(classifyFile(["FX"], "noise fall.wav")).toMatchObject({
      category: "fx",
    });
    expect(classifyFile(["Cymbals"], "crash.wav").category).toBe("cymbal");
  });
  it("keeps DRUM and LOOP alone invalid and lets drum Types imply DRUM", () => {
    for (const types of [["DRUM"], ["LOOP"], []])
      expect(validTypeSelection(types)).toBe(false);
    for (const types of [["kick"], ["DRUM", "LOOP"], ["BASS", "LOOP"], ["FX"]])
      expect(validTypeSelection(types)).toBe(true);
  });
});


it("indexes large libraries in responsive metadata batches and restores unchanged records", async () => {
  const files = Array.from({ length: 1500 }, (_, i) => ({
    ...file(`Library/Pack/Kicks/kick_${i}.wav`),
    size: 20_000_000_000 / 1500,
    source: () => { throw new Error("Indexing must never read audio"); },
  }));
  let browserTurn = false;
  setTimeout(() => { browserTurn = true; }, 0);
  const progress: number[] = [];
  const first = await refreshLibraryAsync("Library", files, undefined, false, (value) => {
    progress.push(value.percent);
  });
  expect(browserTurn).toBe(true);
  expect(progress.length).toBeGreaterThan(8);
  expect(progress).toEqual([...progress].sort((a, b) => a - b));
  expect(first.index.samples).toEqual(refreshLibrary("Library", files).index.samples);
  const next = await refreshLibraryAsync("Library", files, first.index);
  expect(next.reused).toBe(1500);
});


it("classifies ordinary snares without requiring confirmation", () => {
  const classification = classifyFile(["Library", "Pack", "Snares"], "snare_001.wav");
  expect(classification.category).toBe("snare");
  expect(classification).not.toHaveProperty("subtype");
  expect(classification.needsReview).toBe(false);
});

it("reuses old library records while discarding subtype fields and mapping FX variants", () => {
  const files = [file("Library/Pack/FX/fall_noise.wav")];
  const first = refreshLibrary("Library", files);
  const legacy = { category: "fall", subtype: "noise fall", confidence: 1, needsReview: false, evidence: "correction" };
  Object.assign(first.index.samples[0], { classification: legacy, correction: legacy });
  const next = refreshLibrary("Library", files, first.index);
  expect(next.reused).toBe(1);
  expect(next.index.samples[0].id).toBe(first.index.samples[0].id);
  expect(next.index.samples[0].classification.category).toBe("fx");
  expect(next.index.samples[0].classification).not.toHaveProperty("subtype");
  expect(next.index.samples[0].correction).not.toHaveProperty("subtype");
});
