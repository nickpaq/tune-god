import type { FolderTypes } from "./samplePack";

/**
 * Folder Types that ship with the app. Paste the contents of an exported `tunegod-folder-types.json` here (its `folderTypes` and `names`)
 * to make them part of every release; the user's own Folder Types in the app are applied on top of these.
 */
export const DEFAULT_FOLDER_TYPES: FolderTypes = {};

/** Display names of the folders above, by key. */
export const DEFAULT_FOLDER_TYPE_NAMES: Record<string, string> = {};
