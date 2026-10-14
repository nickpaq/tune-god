import { describe, expect, it } from "vitest";
import { folderTypesFile, parseFolderTypesFile } from "./folderTypesFile";

describe("folder Types file", () => {
  it("round-trips the Types and the folder names", () => {
    const text = folderTypesFile({ stomps: "fx", "gun cock": "fx", "perc hits": "perc" }, { stomps: "Stomps", "gun cock": "Gun Cock" }, "1.2.3", new Date("2026-01-01T00:00:00Z"));
    expect(JSON.parse(text)).toMatchObject({ format: "tunegod-folder-types", app: "1.2.3", exportedAt: "2026-01-01T00:00:00.000Z" });
    expect(parseFolderTypesFile(text)).toEqual({
      folderTypes: { "gun cock": "fx", "perc hits": "perc", stomps: "fx" },
      names: { "gun cock": "Gun Cock", "perc hits": "perc hits", stomps: "Stomps" },
    });
  });
  it("rejects other files and drops unknown Types", () => {
    expect(parseFolderTypesFile("not json")).toBeNull();
    expect(parseFolderTypesFile(JSON.stringify({ format: "other", folderTypes: {} }))).toBeNull();
    expect(parseFolderTypesFile(JSON.stringify({ format: "tunegod-folder-types", folderTypes: { a: "fx", b: "bogus", c: "other" } }))?.folderTypes).toEqual({ a: "fx" });
  });
});
