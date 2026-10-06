import { describe, expect, it } from "vitest";
import { bpmFromName, keyFromName } from "./nameKey";

describe("keyFromName", () => {
  it("reads a minor key and a major key, with sharps and flats", () => {
    expect(keyFromName("Dark_Pluck_Am_140bpm.wav")).toEqual({ pc: 9, minor: true, minorPc: 9 });
    expect(keyFromName("Melody 03 - F#min.wav")).toEqual({ pc: 6, minor: true, minorPc: 6 });
    expect(keyFromName("Keys Loop Bb Major.wav")).toEqual({ pc: 10, minor: false, minorPc: 7 });
    expect(keyFromName("lead_Cmaj.wav")).toEqual({ pc: 0, minor: false, minorPc: 9 });
  });
  it("takes a bare note only with an accidental or the word key", () => {
    expect(keyFromName("Pad_C#_90bpm.wav")?.pc).toBe(1);
    expect(keyFromName("Pad_Key_G.wav")?.pc).toBe(7);
    expect(keyFromName("Loop_A_01.wav")).toBeNull();
    expect(keyFromName("Take B.wav")).toBeNull();
  });
  it("ignores words and lowercase letters", () => {
    expect(keyFromName("am_i_dm.wav")).toBeNull();
    expect(keyFromName("Kick_01.wav")).toBeNull();
  });
});

describe("bpmFromName", () => {
  it("reads the number beside bpm", () => {
    expect(bpmFromName("Loop_140bpm_Am.wav")).toBe(140);
    expect(bpmFromName("Loop 95 BPM.wav")).toBe(95);
    expect(bpmFromName("bpm_128_loop.wav")).toBe(128);
  });
  it("ignores other numbers and silly values", () => {
    expect(bpmFromName("Loop_120_Am.wav")).toBeNull();
    expect(bpmFromName("Loop_9bpm.wav")).toBeNull();
    expect(bpmFromName("Loop_900bpm.wav")).toBeNull();
  });
});
