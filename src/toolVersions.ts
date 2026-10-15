import { CLASSIFIER_VERSION } from "./audio/samplePack";
import { CLASSIFICATION_VERSION } from "./audio/libraryIndex";

export interface ToolVersion { name: string; version: string }

/**
 * The version of each tool, shown at the bottom of the menu next to the app version. Bump a tool's version here (minor for a feature, patch for a fix)
 * whenever its behaviour changes, in the same commit as the app version bump. The classifier's numbers come from the code, so they cannot drift.
 */
export const TOOL_VERSIONS: ToolVersion[] = [
  { name: "Product spec", version: "1.14.0" },
  { name: "Chopper mode", version: "1.1.0" },
  { name: "Song chop editor", version: "0.9.0" },
  { name: "Chop to pads", version: "1.2.0" },
  { name: "Pattern maker", version: "1.0.0" },
  { name: "Acapella mode", version: "1.0.0" },
  { name: "Synced mode", version: "1.1.0" },
  { name: "Sequencer (SEQ)", version: "1.0.0" },
  { name: "Library index", version: "1.1.0" },
  { name: "Hot swap", version: "1.2.0" },
  { name: "Classifier rules", version: `${CLASSIFIER_VERSION}.${CLASSIFICATION_VERSION}` },
  { name: "Folder Types", version: "1.1.0" },
  { name: "Mix balance", version: "2.0.0" },
];
