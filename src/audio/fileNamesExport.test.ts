import { describe, expect, it } from "vitest";
import { fileNamesExport } from "./fileNamesExport";
import { correctSample, refreshLibrary } from "./libraryIndex";

const mk = (path: string) => ({ name: path.split("/").pop()!, folders: path.split("/").slice(1, -1), rootFolder: path.split("/")[0], size: 10, lastModified: 1, source: async () => new ArrayBuffer(0) }) as any;

describe("file names export", () => {
  const files = [mk("Lib/Kit/Stomps/Big Stomp.wav"), mk("Lib/Kit/Kicks/Thud.wav"), mk("Lib/Kit/Gun Cock/Best Gun Cock.wav")];
  const { index } = refreshLibrary("Lib", files);

  it("lists every file with its Type, how it was decided and its path without the picked folder's name", () => {
    const text = fileNamesExport(index);
    const lines = text.trim().split("\n");
    expect(lines[0]).toBe("Type\tHow\tPath");
    expect(lines).toHaveLength(4);
    expect(lines).toContain("Kick\tfolder\tKit/Kicks/Thud.wav");
    expect(lines).toContain("Other\tunknown\tKit/Stomps/Big Stomp.wav");
  });

  it("keeps only unclassified files, leaving out ones the user corrected", () => {
    const corrected = correctSample(index, index.samples.find((s) => s.name === "Big Stomp.wav")!.id, { category: "fx", confidence: 1, needsReview: false, evidence: "correction" });
    const lines = fileNamesExport(corrected, "unclassified").trim().split("\n");
    expect(lines).toEqual(["Type\tHow\tPath", "Other\tunknown\tKit/Gun Cock/Best Gun Cock.wav"]);
  });
});
