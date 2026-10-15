import type { FolderTypes } from "./samplePack";

/**
 * Folder Types that ship with the app, so a library classifies well without the user setting anything. Keys are `tidy(folder name)`.
 * They come from the folder names found in real sample libraries (see `defaultFolderTypes.test.ts`); the user's own Folder Types in the app are applied on top.
 * To add more, paste the `folderTypes` and `names` of an exported `tunegod-folder-types.json` here.
 */
export const DEFAULT_FOLDER_TYPES: FolderTypes = {
  "~ sfxs": "fx",
  "~ gltichs": "fx",
  "gun cock": "fx",
  "gong's": "fx",
  "~ strobe": "fx",
  "accents": "fx",
  "smokey drops": "fx",
  "tags": "fx",
  "!tags": "fx",
  "stomps": "perc",
  "laughs": "vox",
  "~ laughs": "vox",
  "skits": "vox",
  "ethnic": "melodic",
  "@prodby xero regalia serum tables": "melodic",
  "woodwinds n stuff": "melodic",
  "orchestra": "melodic",
  "samples": "melodicLoop",
  "classic smokey samples": "melodicLoop",
  "classic soudiere samples": "melodicLoop",
  "sample me later": "melodicLoop",
  "orignalloops": "melodicLoop",
  "chops": "melodicLoop",
  "chops & samples": "melodicLoop",
  "custom loops": "melodicLoop",
  "phrases rolls etc, time scretched": "drumLoop",
  "fills": "drumLoop",
};

/** Display names of the folders above, by key. */
export const DEFAULT_FOLDER_TYPE_NAMES: Record<string, string> = {
  "~ sfxs": "~ Sfxs",
  "~ gltichs": "~ Gltichs",
  "gun cock": "Gun Cock",
  "gong's": "Gong's",
  "~ strobe": "~ Strobe",
  "accents": "Accents",
  "smokey drops": "SMOKEY DROPS",
  "tags": "Tags",
  "!tags": "!TAGS",
  "stomps": "Stomps",
  "laughs": "Laughs",
  "~ laughs": "~ Laughs",
  "skits": "Skits",
  "ethnic": "Ethnic",
  "@prodby xero regalia serum tables": "@PRODBY.XERO Regalia Serum Tables",
  "woodwinds n stuff": "Woodwinds n Stuff",
  "orchestra": "Orchestra",
  "samples": "Samples",
  "classic smokey samples": "CLASSIC SMOKEY SAMPLES",
  "classic soudiere samples": "CLASSIC SOUDIERE SAMPLES",
  "sample me later": "Sample Me Later",
  "orignalloops": "OrignalLoops",
  "chops": "Chops",
  "chops & samples": "Chops & Samples",
  "custom loops": "Custom Loops",
  "phrases rolls etc, time scretched": "Phrases (Rolls Etc, Time Scretched)",
  "fills": "Fills",
};
