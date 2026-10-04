import { describe, expect, it } from "vitest";
import { cleanSampleName, displayName, packTags } from "./sampleName";

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

describe("pack tags", () => {
  const rio = ["Bell Perc", "Beach Perc", "Flavor Perc", "Hour Perc", "Sharp Clap"].map((n) => `Rio - ${n}.wav`);

  it("drops a tag most of the project's sounds share", () => {
    const names = [...rio, "808 Sub.wav", "03 - [clap] Luxury Clap.wav"];
    const tags = packTags(names);
    expect([...tags]).toEqual(["rio"]);
    expect(displayName("Rio - Bell Perc.wav", tags)).toBe("Bell Perc");
    expect(displayName("03 - Rio - Sharp Clap.wav", tags)).toBe("Sharp Clap");
    expect(displayName("03 - [clap] Luxury Clap.wav", tags)).toBe("Luxury Clap");
  });

  it("leaves a tag alone when only a few sounds have it", () => {
    const names = [...rio.slice(0, 3), ...Array.from({ length: 20 }, (_, i) => `Other ${i}.wav`)];
    expect(packTags(names).size).toBe(0);
    expect(displayName("Rio - Bell Perc.wav", packTags(names))).toBe("Rio - Bell Perc");
  });

  it("keeps a name's own dash when it is not a shared tag", () => {
    expect(displayName("Big - Boom.wav", new Set(["rio"]))).toBe("Big - Boom");
  });
});
