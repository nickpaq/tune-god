import { describe, expect, it } from "vitest";
import { parseSoundName, parseSoundNames } from "./soundName";

describe("isolating the sound's own name", () => {
  it("reads the example from the user: tag, tempo, type and key leave the name", () => {
    expect(parseSoundName("EUD_140_808_askari_Em.wav")).toEqual({ name: "Askari", tag: "EUD", bpm: 140, key: "Em", kind: ["808"] });
  });
  it("tempo beside bpm, and keys written many ways", () => {
    expect(parseSoundName("DBM_SL_LVSH_ELEVATOR_VIBE_87BPM_G-MINOR.wav")).toMatchObject({ bpm: 87, key: "Gm", tag: "DBM SL LVSH", name: "ELEVATOR VIBE" });
    expect(parseSoundName("140bpm - G#min - Coddeine x 11symbol.mp3")).toMatchObject({ bpm: 140, key: "G#m", name: "Coddeine X 11symbol" });
    expect(parseSoundName("ABC_SVGAR_Stack_Glow_2_C#m_122BPM.wav")).toMatchObject({ bpm: 122, key: "C#m", name: "Glow" });
  });
  it("808 and take numbers are never a tempo", () => {
    expect(parseSoundName("[tumfy] 808 - absosmackley.wav")).toMatchObject({ bpm: null, kind: ["808"], name: "Absosmackley" });
    expect(parseSoundName("Hit (125).wav").bpm).toBeNull();
  });
  it("keeps something to show when only numbers are left", () => {
    expect(parseSoundName("GTASA (280).wav").name).toBe("GTASA 280");
    expect(parseSoundName("Perc 29.wav").name).toBe("Perc 29");
  });
  it("drops a prefix the folder's other files share", () => {
    const files = ["rio leyva_glo_152bpm.mp3", "rio leyva_lemons_132bpm.mp3", "rio leyva_twix_124bpm.mp3", "rio leyva_mist_135bpm.mp3"];
    const parsed = parseSoundNames(files, (f) => f, () => "Loops");
    expect(files.map((f) => parsed.get(f)!.name)).toEqual(["Glo", "Lemons", "Twix", "Mist"]);
    expect(parsed.get(files[0])).toMatchObject({ tag: "rio leyva", bpm: 152 });
  });
  it("never leaves an empty name", () => {
    expect(parseSoundName("Kick.wav").name).toBe("Kick");
    expect(parseSoundName("808.wav").name).toBe("808");
  });
});
