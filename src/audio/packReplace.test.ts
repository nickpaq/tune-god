import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

// A file's name says how long it is ("12s.wav"); the decoder is faked so no audio is needed.
vi.mock("./decode", () => ({
  decodeNative: async (file: File) => {
    const seconds = Number(file.name.replace("s.wav", ""));
    return { sampleRate: 1000, channelData: [new Float32Array(seconds * 1000).fill(0.1)] };
  },
}));

import { writeBankSounds } from "./packProject";
import type { BankGroup } from "./bankLoad";

const file = (seconds: number) => ({ folders: [], name: `${seconds}s.wav`, size: 1000, source: async () => new File([""], `${seconds}s.wav`) });

async function project() {
  const zip = new JSZip();
  return { zip, samplerJson: { samples: [], pads: [] }, originalName: "p.koala", pads: [], padBase: 0 } as any;
}

describe("sounds that are too long are replaced by others", () => {
  it("keeps trying files until the group is full", async () => {
    const group: BankGroup<any> = { category: "melodicLoop", candidates: [file(90), file(75), file(70), file(5), file(6), file(7)], want: 3 };
    const result = await writeBankSounds(await project(), [group], { existing: [], byteBudget: 1e9, maxSeconds: 60 });
    expect(result?.sounds).toHaveLength(3);
    expect(result?.skipped).toBe(0);
  });
  it("counts only what no file could fill", async () => {
    const group: BankGroup<any> = { category: "melodicLoop", candidates: [file(90), file(5), file(6)], want: 3 };
    const result = await writeBankSounds(await project(), [group], { existing: [], byteBudget: 1e9, maxSeconds: 60 });
    expect(result?.sounds).toHaveLength(2);
    expect(result?.skipped).toBe(1);
  });
});
