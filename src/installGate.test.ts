import { describe, expect, it } from "vitest";
import { isInstalled } from "./installGate";

describe("isInstalled", () => {
  it("is true for an iOS Home Screen launch", () => expect(isInstalled({ standalone: true })).toBe(true));
  it("is true for a standalone display mode", () => expect(isInstalled({ displayStandalone: true })).toBe(true));
  it("is false in a browser tab", () => expect(isInstalled({ standalone: false, displayStandalone: false })).toBe(false));
  it("is false when nothing is reported", () => expect(isInstalled({})).toBe(false));
});
