import { describe, expect, it } from "vitest";
import { classifyByName, classifySample } from "./classify";

describe("classification by name", () => {
  it("reads hat types from the name", () => {
    expect(classifyByName("Open_Hat_01.wav")).toBe("openHat");
    expect(classifyByName("ride.wav")).toBe("cymbal");
    expect(classifyByName("crash 2.wav")).toBe("cymbal");
    expect(classifyByName("closed hat.wav")).toBe("closedHat");
    expect(classifyByName("hihat 3.wav")).toBe("hat");
  });

  it("separates claps from snares and sends shakers and toms to perc", () => {
    expect(classifyByName("clap.wav")).toBe("clap");
    expect(classifyByName("rim shot.wav")).toBe("snare");
    expect(classifyByName("snare.wav")).toBe("snare");
    expect(classifyByName("floor tom.wav")).toBe("perc");
    expect(classifyByName("shaker.wav")).toBe("perc");
    expect(classifyByName("breath 2.wav")).toBe("vox");
  });

  it("turns a name containing loop into the loop version of its category", () => {
    expect(classifyByName("drum loop 90.wav")).toBe("drumLoop");
    expect(classifyByName("hat_loop.wav")).toBe("drumLoop");
    expect(classifyByName("perc loop.wav")).toBe("percLoop");
    expect(classifyByName("piano loop.wav")).toBe("melodicLoop");
    expect(classifyByName("amen break.wav")).toBe("drumLoop");
    expect(classifyByName("loop 3.wav")).toBeNull();
  });

  it("resolves an unnamed hat by decay time", () => {
    const tick = (seconds: number) => {
      const sr = 44100;
      const out = new Float32Array(sr * 2);
      for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * Math.exp(-i / sr / (seconds / 4.6));
      return out;
    };
    expect(classifySample(tick(0.05), 44100, "hihat 1.wav", null)).toBe("closedHat");
    expect(classifySample(tick(0.8), 44100, "hihat 1.wav", null)).toBe("openHat");
  });
});
