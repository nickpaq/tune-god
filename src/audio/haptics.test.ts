import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic, setHapticHandler } from "./haptics";

afterEach(() => setHapticHandler(null));

describe("haptics", () => {
  it("goes through the installed handler", () => {
    const seen = vi.fn();
    setHapticHandler(seen);
    haptic("heavy");
    expect(seen).toHaveBeenCalledWith("heavy");
  });
  it("never throws, with a failing handler or no vibration API", () => {
    setHapticHandler(() => {
      throw new Error("no");
    });
    expect(() => haptic("light")).not.toThrow();
    setHapticHandler(null);
    expect(() => haptic("success")).not.toThrow();
  });
});
