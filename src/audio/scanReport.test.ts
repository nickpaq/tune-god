import { describe, expect, it } from "vitest";
import { buildScanReport } from "./scanReport";
import { refreshLibrary } from "./libraryIndex";
import { findPackInFileList } from "./packProject";

const entry = (path: string, size = 100) => ({ path, size });

describe("scan report", () => {
  it("accounts for hidden, non-audio, duplicate and indexed files", () => {
    const raw = [
      entry("Lib/Pack/Kicks/a.wav"), entry("Lib/Pack/Kicks/b.wav"), entry("Lib/Pack/808s/long.wav"), entry("Lib/Pack/Kicks/zero.wav", 0),
      entry("Lib/Pack/Kicks/._a.wav"), entry("Lib/__MACOSX/x.wav"), entry("Lib/.hidden/y.wav"), entry("Lib/Pack/.DS_Store"),
      entry("Lib/Pack/readme.txt"), entry("Lib/Pack/preset.fxp"), entry("Lib/Pack/other.fxp"),
      entry("Lib/Pack/Kicks/a.wav"),
    ];
    const files = raw.map((r) => new File([new Uint8Array(r.size)], r.path.split("/").pop()!));
    for (const [i, file] of files.entries()) Object.defineProperty(file, "webkitRelativePath", { value: raw[i].path });
    const found = findPackInFileList(files);
    const { index } = refreshLibrary(found.name, found.files);
    const report = buildScanReport(raw, index);
    expect(report).toContain("Entries delivered by the folder picker: 12");
    expect(report).toContain("Hidden, skipped: 4");
    expect(report).toContain('"._" copies (macOS resource forks): 1 · __MACOSX: 1 · inside dot folders: 1 · other dot files: 1');
    expect(report).toContain("Not a supported audio extension, skipped: 3");
    expect(report).toContain(".fxp: 2");
    expect(report).toContain("Audio files (wav, wave, aif, aiff, flac, mp3, ogg, m4a): 5");
    expect(report).toContain("Duplicate paths merged: 1");
    expect(report).toContain("Unique audio files: 4");
    expect(report).toContain("Indexed in the library: 4");
    expect(report).toContain("Zero-byte audio files");
    expect(report).toContain("Pack: 4 / 4 / 0");
  });
});
