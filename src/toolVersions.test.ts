import { describe, expect, it } from "vitest";
import { TOOL_VERSIONS } from "./toolVersions";

describe("tool versions", () => {
  it("lists each tool once with a dotted version", () => {
    expect(new Set(TOOL_VERSIONS.map((tool) => tool.name)).size).toBe(TOOL_VERSIONS.length);
    for (const tool of TOOL_VERSIONS) expect(tool.version).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });
});
