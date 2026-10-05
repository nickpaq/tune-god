import { describe, expect, it } from "vitest";
import type { Pad } from "../../components/PadPanel";
import { baseName, checkStems, isVocalsName, songNameOfVocals, vocalsNameFor } from "./stems";

const pad = (name: string, seconds = 100, sampleRate = 44100, index = 0): Pad => ({
  index,
  origIndex: index,
  name,
  sampleId: index + 1,
  sampleRate,
  channelData: [new Float32Array(Math.round(seconds * sampleRate))],
  tune: false,
  semis: 0,
  cents: 0,
});

describe("names", () => {
  it("the stem is the song's file name, a space and VOCALS in capitals", () => {
    expect(vocalsNameFor("Toxic")).toBe("Toxic VOCALS");
    expect(vocalsNameFor("Toxic.wav")).toBe("Toxic VOCALS");
    expect(vocalsNameFor("Britney Spears - Toxic.mp3")).toBe("Britney Spears - Toxic VOCALS");
  });

  it("recognises a stem and the song it belongs to", () => {
    expect(isVocalsName("Toxic VOCALS")).toBe(true);
    expect(isVocalsName("Toxic VOCALS.wav")).toBe(true);
    expect(isVocalsName("Toxic")).toBe(false);
    expect(isVocalsName("VOCALS")).toBe(false);
    expect(isVocalsName("Toxic DRUMS")).toBe(false);
    expect(songNameOfVocals("Toxic VOCALS.wav")).toBe("Toxic");
    expect(baseName("a.b.c.WAV")).toBe("a.b.c");
  });
});

describe("checkStems", () => {
  const song = pad("Toxic.wav", 199.5, 44100, 3);
  const vocals = pad("Toxic VOCALS.wav", 199.5, 44100, 4);

  it("finds the stem of the song that was tapped", () => {
    const check = checkStems(song, [song, vocals, pad("kick.wav", 1, 44100, 5)]);
    expect(check).toMatchObject({ ok: true });
    if (check.ok) expect([check.song, check.vocals]).toEqual([song, vocals]);
  });

  it("works whichever of the two was tapped", () => {
    const check = checkStems(vocals, [song, vocals]);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.song).toBe(song);
  });

  it("matches the extension and case loosely, since only the name counts", () => {
    expect(checkStems(song, [song, pad("toxic vocals", 199.5, 44100, 4)]).ok).toBe(true);
    expect(checkStems(pad("Toxic.mp3"), [pad("Toxic.mp3"), pad("Toxic VOCALS.wav", 100)]).ok).toBe(true);
  });

  it("tells the user to do the stem split, and to leave it alone, when there is no stem", () => {
    const check = checkStems(song, [song, pad("Toxic DRUMS.wav", 199.5, 44100, 4)]);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe("no-vocals");
      expect(check.message).toContain('"Toxic VOCALS"');
      expect(check.message).toMatch(/Stem Split/);
      expect(check.message).toMatch(/start and end points/);
    }
  });

  it("does not take another song's stem", () => {
    expect(checkStems(song, [song, pad("Other VOCALS.wav", 199.5, 44100, 4)]).ok).toBe(false);
  });

  it("says so when a stem was tapped but its song is not there", () => {
    const check = checkStems(vocals, [vocals]);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("no-song");
  });

  it("refuses a stem of a different length, which means a start or end point was touched", () => {
    const check = checkStems(song, [song, pad("Toxic VOCALS.wav", 197.1, 44100, 4)]);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe("length");
      expect(check.message).toMatch(/199\.50 s/);
    }
  });

  it("allows a few milliseconds of difference, and compares in time so sample rates may differ", () => {
    expect(checkStems(song, [song, pad("Toxic VOCALS.wav", 199.51, 44100, 4)]).ok).toBe(true);
    expect(checkStems(song, [song, pad("Toxic VOCALS.wav", 199.5, 48000, 4)]).ok).toBe(true);
  });
});
