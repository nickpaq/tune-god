import { CATEGORIES, type CategoryId } from "./classify";
import type { FolderTypes } from "./samplePack";

export const FOLDER_TYPES_FILE_NAME = "tunegod-folder-types.json";
const FORMAT = "tunegod-folder-types";

/** The file a user exports and brings back: the whole set (built in and their own), with the folders' display names. */
export function folderTypesFile(folderTypes: FolderTypes, names: Record<string, string>, appVersion: string, when = new Date()): string {
  const keys = Object.keys(folderTypes).sort((a, b) => a.localeCompare(b));
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    app: appVersion,
    exportedAt: when.toISOString(),
    folderTypes: Object.fromEntries(keys.map((key) => [key, folderTypes[key]])),
    names: Object.fromEntries(keys.map((key) => [key, names[key] ?? key])),
  }, null, 2) + "\n";
}

/** Read an exported file back; anything that is not a known Type is dropped. Returns null when the text is not a Folder Types file. */
export function parseFolderTypesFile(text: string): { folderTypes: FolderTypes; names: Record<string, string> } | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || data.format !== FORMAT || typeof data.folderTypes !== "object" || data.folderTypes === null) return null;
  const valid = new Set<string>(CATEGORIES.map((category) => category.id));
  const folderTypes: FolderTypes = {};
  const names: Record<string, string> = {};
  for (const [key, category] of Object.entries<unknown>(data.folderTypes)) {
    if (typeof category !== "string" || !valid.has(category) || category === "other" || !key) continue;
    folderTypes[key] = category as CategoryId;
    const name = data.names?.[key];
    if (typeof name === "string" && name) names[key] = name;
  }
  return { folderTypes, names };
}
