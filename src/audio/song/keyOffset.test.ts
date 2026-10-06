import { describe, expect, it } from "vitest";
import { keyOffset } from "./keyOffset";

describe("keyOffset", () => {
  it("is 0 with no key picked or no song key", () => {
    expect(keyOffset({ pc: 9, minor: true }, null, false)).toBe(0);
    expect(keyOffset(null, 3, false)).toBe(0);
  });
  it("moves a minor song to a minor key the short way", () => {
    expect(keyOffset({ pc: 9, minor: true }, 11, false)).toBe(2); // A minor to B minor
    expect(keyOffset({ pc: 9, minor: true }, 4, false)).toBe(-5); // A minor to E minor
    expect(keyOffset({ pc: 0, minor: true }, 6, false)).toBe(6);
  });
  it("treats a major key and its relative minor as one key", () => {
    expect(keyOffset({ pc: 0, minor: false }, 9, false)).toBe(0); // C major is A minor
    expect(keyOffset({ pc: 9, minor: true }, 0, true)).toBe(0); // piano on C major
    expect(keyOffset({ pc: 0, minor: false }, 2, true)).toBe(2); // C major to D major
  });
});
