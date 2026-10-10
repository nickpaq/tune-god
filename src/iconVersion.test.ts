import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The home-screen icon carries the version on its cheek (scripts/icon/stamp-icons.py). A version bump without a new stamp fails here.
describe("app icon", () => {
  it("is stamped with the version in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const stamped = readFileSync(new URL("../public/icon-version.txt", import.meta.url), "utf8").trim();
    expect(stamped, "run: python3 scripts/icon/stamp-icons.py").toBe(pkg.version);
  });
});
