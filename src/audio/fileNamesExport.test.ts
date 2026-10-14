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

import { fileTreeExport } from "./fileNamesExport";

describe("file tree export", () => {
  it("nests folders and files with counts, folders before files, audio only", () => {
    const files = [
      mk("Lib/Pack B/Kicks/Kick 10.wav"), mk("Lib/Pack B/Kicks/Kick 2.wav"), mk("Lib/Pack B/Kicks/._Kick 2.wav"), mk("Lib/Pack B/Kicks/Kick 2.asd"),
      mk("Lib/Pack A/Loops/Sub/Loop.flac"), mk("Lib/Pack A/cover.png"), mk("Lib/Pack A/Intro.mp3"),
    ];
    // the picker filters like the app does: audio only, no hidden files
    const audio = files.filter((f) => /\.(wav|flac|mp3)$/i.test(f.name) && !f.name.startsWith("."));
    const { index } = refreshLibrary("Lib", audio);
    expect(fileTreeExport(index)).toBe([
      "Lib/  (4)",
      "  Pack A/  (2)",
      "    Loops/  (1)",
      "      Sub/  (1)",
      "        Loop.flac  [Bass Loop]",
      "    Intro.mp3  [Other]",
      "  Pack B/  (2)",
      "    Kicks/  (2)",
      "      Kick 2.wav  [Kick]",
      "      Kick 10.wav  [Kick]",
      "",
    ].join("\n"));
  });
});
