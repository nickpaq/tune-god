import { describe, expect, it } from "vitest";
import { findPackInFileList } from "./packProject";
import { planKit, planOneShots } from "./bankLoad";

const picked = (path: string) => {
  const file = new File([new Uint8Array(8)], path.split("/").at(-1)!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
};

describe("original folder paths", () => {
  it("preserves every folder and the original filename for display", () => {
    const pack = findPackInFileList([picked("Library/Pack Name/Percussion/Piano.wav")]);
    expect(pack.files[0].sourcePath).toBe("Library/Pack Name/Percussion/Piano.wav");
    expect(planKit(pack.files).groups[0].category).toBe("perc");
  });
  it("classifies the selected root without treating it as a subfolder", () => {
    const pack = findPackInFileList([picked("Melodic One Shots/Kick.wav")]);
    expect(pack.files[0].folders).toEqual([]);
    expect(planOneShots(pack.files).groups[0].category).toBe("melodic");
    const bells = findPackInFileList([picked("Bells/Synth.wav")]);
    expect(planOneShots(bells.files).groups).toEqual([]);
    expect(planKit(bells.files).groups[0].category).toBe("perc");
  });
  it("identifies 808s from the selected folder, never a filename", () => {
    expect(planKit(findPackInFileList([picked("808/Piano.wav")]).files).groups[0].is808).toBe(true);
    expect(planKit(findPackInFileList([picked("Bass/808.wav")]).files).groups[0].is808).toBeFalsy();
  });
});
