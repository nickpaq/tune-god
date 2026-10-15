import { describe, expect, it } from "vitest";
import { exportFileName, keyLabel } from "./exportFileName";

describe("export file name", () => {
  it("is the project name, the key and the tempo", () => {
    expect(exportFileName("TuneGod - All Kits.koala", "Am", 140)).toBe("TuneGod - All Kits - Am - 140bpm.koala");
    expect(exportFileName("TuneGod - Rio Pack", "Cmaj", 92.5)).toBe("TuneGod - Rio Pack - Cmaj - 92.5bpm.koala");
  });
  it("leaves the key out when none is picked, and trims the tempo's decimals", () => {
    expect(exportFileName("TuneGod - All Kits.koala", null, 120)).toBe("TuneGod - All Kits - 120bpm.koala");
    expect(exportFileName("x.koala", null, 120.004)).toBe("x - 120bpm.koala");
    expect(exportFileName("x.koala", null, 87.5)).toBe("x - 87.5bpm.koala");
  });
  it("does not repeat the key and tempo of an earlier export, or the old _tuned suffix", () => {
    expect(exportFileName("TuneGod - All Kits - Am - 140bpm.koala", "F#m", 150)).toBe("TuneGod - All Kits - F#m - 150bpm.koala");
    expect(exportFileName("My Beat - 90bpm.koala", null, 95)).toBe("My Beat - 95bpm.koala");
    expect(exportFileName("My Beat_tuned.koala", "Dm", 100)).toBe("My Beat - Dm - 100bpm.koala");
  });
  it("names minor and major keys", () => {
    expect(keyLabel(9, false)).toBe("Am");
    expect(keyLabel(1, true)).toBe("C#maj");
    expect(keyLabel(null, false)).toBeNull();
  });
});
