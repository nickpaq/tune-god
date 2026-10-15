import { describe, expect, it } from "vitest";
import { categoryOfFile, classifyFile, tidy } from "./samplePack";
import { DEFAULT_FOLDER_TYPES, DEFAULT_FOLDER_TYPE_NAMES } from "./defaultFolderTypes";
import { hasTempoInName, stripProducerTags } from "./classify";

// Names taken from real libraries (the user's exported file list). Defaults are applied the way the app applies them.
const cat = (path: string, duration?: number) => {
  const parts = path.split("/");
  const name = parts.pop()!;
  return classifyFile(parts, name, undefined, duration, DEFAULT_FOLDER_TYPES).category;
};

describe("shipped folder Types", () => {
  it("keys are tidy folder names with a display name each", () => {
    for (const key of Object.keys(DEFAULT_FOLDER_TYPES)) {
      expect(tidy(key)).toBe(key);
      expect(DEFAULT_FOLDER_TYPE_NAMES[key], key).toBeTruthy();
      expect(tidy(DEFAULT_FOLDER_TYPE_NAMES[key]), key).toBe(key);
    }
  });
  it("types the folders found in real libraries", () => {
    expect(cat("Coddiene - Stash Kit/~ Sfxs/sfxcar (3).wav")).toBe("fx");
    expect(cat("Steal Yo Ting - Stash/Accents/Accent_Robots.wav")).toBe("fx");
    expect(cat("Classics Sounds Drum Kit Vol 1/Tags/TAGS (9).wav")).toBe("fx");
    expect(cat("Coddiene - Stash Kit/~ Laughs/laugh (7).mp3")).toBe("vox");
    expect(cat("NAVO Nu - Jersey Kit/Stomps/Goblin Stomp.wav")).toBe("perc");
    expect(cat("Steal Yo Ting - Stash/Ethnic/Ethnic_Oud3.wav")).toBe("melodic");
    expect(cat("Jason Rich - Kit 5/Jason Rich - Kit 5/Samples/Destiny (124).wav")).toBe("melodicLoop");
    expect(cat("Dj Smokey - Smoked Out/SAMPLES/CLASSIC SMOKEY SAMPLES/smokey classic 23.wav")).toBe("melodicLoop");
    expect(cat("@TWOWAVS DRUM AND LOOP KIT/!!Loops/Sample Me Later/Jon B Calling On You@twowav.mp3")).toBe("melodicLoop");
    expect(cat("@TWOWAVS DRUM AND LOOP KIT/!!Loops/Chops/HALLOWEEN PT3@twowav.wav")).toBe("melodicLoop");
    expect(cat("WavSupply Rio Leyva Alien (Drum Kit)/Phrases (Rolls Etc, Time Scretched)/Rio - Opal Phrase.wav")).toBe("drumLoop");
  });
});

describe("tempo, sampled-music and drum-fill names", () => {
  it("reads a tempo in the name", () => {
    for (const n of ["RIO LEYVA_GLO_152BPM.mp3", "Bpm100_FairySong.wav", "WeAllDieSometime (116).wav", "[tumfy] danasol 140.mp3", "143 Interesting@twowav.mp3", "Amusement__82_bpm_.wav"]) expect(hasTempoInName(n), n).toBe(true);
    for (const n of ["Hit (9).wav", "laugh (7).mp3", "Glitch 14.wav", "SND - N (1).wav", "Kick 808.wav"]) expect(hasTempoInName(n), n).toBe(false);
  });
  it("makes a loop of a sound only a tempo or a sampled-music word describes", () => {
    expect(cat("Internet Money Rio Leyva Wifi (Loop Kit)/rio leyva_soulsilver_140bpm.wav")).toBe("melodicLoop");
    expect(cat("LAB HOURS - Loop Collection/[tumfy] tamale 157.mp3")).toBe("melodicLoop");
    expect(cat("Pack/Bpm100_FairySong.wav")).toBe("melodicLoop");
    expect(cat("Jason Rich - Kit 5/Jason Rich - Kit 5/OrignalLoops/White Widow [Layer 1].wav")).toBe("melodicLoop");
    expect(cat("Pack/SO_SNA_75_songstarter_montrose_guita.wav")).toBe("melodicLoop");
    expect(cat("Pack/Hit (9).wav")).toBe("other");
  });
  it("a stated tempo overrides the named sound: there is no one-shot with a bpm", () => {
    expect(cat("Pack/Kick 140bpm.wav")).toBe("drumLoop");
    expect(cat("Pack/Kicks/Kick_140_BPM.wav")).toBe("drumLoop");
    expect(cat("Pack/Vocal 120bpm.wav")).toBe("voxLoop");
    expect(cat("Pack/Snare_100_punchy.wav")).toBe("drumLoop");
    expect(cat("Pack/Perc_95bpm.wav")).toBe("percLoop");
    expect(cat("Pack/FX 128bpm.wav")).toBe("fxLoop");
  });
  it("a pack code before the tempo names the pack, not a drum", () => {
    expect(cat("! Splice/SS_SD_90_guitar_lion_rhythm_Amin.wav")).toBe("melodicLoop");
    expect(cat("! Splice/VOX_JSPR_120_guitar_crunch_next_to_me_Em.wav")).toBe("melodicLoop");
    expect(cat("! Splice/BD_140_piano_minato_Gmaj.wav")).toBe("melodicLoop");
  });
  it("a take number at the end is not a tempo", () => {
    expect(cat("Pack/Kick 120.wav")).toBe("kick");
    expect(cat("Pack/Snare (100).wav")).toBe("snare");
    expect(cat("Pack/808 Kick 01.wav")).toBe("kick");
  });
  it("drum fills and rolls are drum loops", () => {
    expect(cat("! Splice/SS_SC_100_drums_fill_short_kiss.wav")).toBe("drumLoop");
    expect(cat("! Splice/Bpm73_SnareRoll12.wav")).toBe("drumLoop");
    expect(cat("@TWOWAVS DRUM AND LOOP KIT/!!!Drums/Fills/Mothers eyes fill@twowav.wav")).toBe("drumLoop");
  });
  it("stems are loops named by what they hold", () => {
    expect(cat("Jason Rich - Kit 5/Projects/Slipknot/stems/Kicks.wav")).toBe("drumLoop");
    expect(cat("Jason Rich - Kit 5/Projects/IDontKnow/stems/808.wav")).toBe("bassLoop");
  });
  it("orchestral articulations are melodic", () => {
    expect(cat("Rio Leyva/RIO - TRAP ONE SHOT KIT/(PIZZICATO) 12.wav")).toBe("melodic");
  });
});

describe("producer tags", () => {
  it("never take part in matching", () => {
    expect(stripProducerTags("[tumfy] 808 - absosmackley.wav").trim()).toBe("808 - absosmackley.wav");
    expect(stripProducerTags("man i trust kick@twowav.wav").trim()).toBe("man i trust kick");
    expect(categoryOfFile(["Pack"], "[tumfy] crash - sector.wav")).toBe("cymbal");
  });
});

describe("conflicts between a folder and a file name", () => {
  it("a mixed folder defers to the file name", () => {
    expect(cat("Classics Sounds/Snares + Claps/Slapper Snare.wav")).toBe("snare");
    expect(cat("DECAP/Snares + Claps + Rimshots/DECAP clap tight.wav")).toBe("clap");
    expect(cat("Rio Leyva/Open Hats + Crashes/GOOD OLD CRASH.wav")).toBe("cymbal");
    expect(cat("Rio Leyva/Open Hats + Crashes/open hat 3.wav")).toBe("openHat");
  });
  it("a single-type folder still wins", () => {
    expect(cat("Pack/Claps/SNARE - SOUTHSIDE.wav")).toBe("clap");
    expect(cat("Pack/Bells/Bell - Sky Light.wav")).toBe("perc");
  });
  it("a drum group folder beats a pack-level vocal word", () => {
    expect(cat("Vocal RnB Vol. 3/Vocal_RnB_3_Audio_repack/Drum_One_Shots/VRB3_Kick_06_F.wav")).toBe("kick");
    expect(cat("Vocal RnB Vol. 3/Vocal_RnB_3_Audio_repack/Vox/VRB3_Vox_06.wav")).toBe("vox");
  });
  it("a pack named for loops does not make its kicks loops", () => {
    expect(cat("@TWOWAVS DRUM AND LOOP KIT/!!!Drums/Kicks/man i trust kick@twowav.wav")).toBe("kick");
    expect(cat("@TWOWAVS DRUM AND LOOP KIT/!!!Drums/Hi Hats/CH/eagle@twowav.wav")).toBe("closedHat");
    expect(cat("Wundertone - Noise Honey/loops/hats/NH_LVV_70_hats_sixteenth_swung.wav")).toBe("drumLoop");
    expect(cat("Wundertone - Noise Honey/loops/drums/NH_LVV_80_drum_groovey.wav")).toBe("drumLoop");
  });
  it("a one shot folder under a loops folder holds one-shots", () => {
    expect(cat("Rio Leyva/!(PREORDER BONUS) One Shots & Loops/RIO - TRAP ONE SHOT KIT/(FLUTE) 3.wav")).toBe("melodic");
  });
  it("808 with a key is bass, not a melodic loop", () => {
    expect(cat("! Splice/EUD_140_808_askari_Em.wav", 12)).toBe("bass");
    expect(cat("Splice - KSHMR Songstarters Vol. 1/Audio/Dance/KSHMR_128_brazil_parade_bass_Amin.wav")).toBe("bassLoop");
  });
});
