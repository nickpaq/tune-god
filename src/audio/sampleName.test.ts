import { describe, expect, it } from "vitest";
import { cleanSampleName } from "./sampleName";

describe("cleanSampleName", () => {
  it("keeps just the sound's own name", () => {
    expect(cleanSampleName("03 - [clap] Luxury Clap.wav")).toBe("Luxury Clap");
    expect(cleanSampleName("12_Dusty_Snare.WAV")).toBe("Dusty Snare");
    expect(cleanSampleName("07. Big Boom (dry).wav")).toBe("Big Boom (dry)");
    expect(cleanSampleName("[kick] Heavy Thud.flac")).toBe("Heavy Thud");
  });

  it("does not eat a number that is part of the name", () => {
    expect(cleanSampleName("808 Kick.wav")).toBe("808 Kick");
    expect(cleanSampleName("909_Open_Hat.wav")).toBe("909 Open Hat");
    expect(cleanSampleName("Kick 2.wav")).toBe("Kick 2");
  });

  it("falls back to the plain name when nothing is left", () => {
    expect(cleanSampleName("[clap].wav")).toBe("[clap]");
    expect(cleanSampleName("01.wav")).toBe("01");
  });
});
