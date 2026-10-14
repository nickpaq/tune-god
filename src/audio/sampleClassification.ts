import { migrateCategory, type CategoryId } from "./classify";

export interface SampleClassification {
  category: CategoryId;
  confidence: number;
  needsReview: boolean;
  evidence: "correction" | "folder" | "filename" | "metadata" | "unknown";
}

/** Read old library/project records using only the supported Type fields. */
export function normalizeClassification(value: SampleClassification): SampleClassification {
  return { category: migrateCategory(value.category), confidence: value.confidence, needsReview: value.needsReview, evidence: value.evidence };
}

export function isLoopCategory(category: CategoryId | undefined): boolean {
  return (
    category === "drumLoop" ||
    category === "percLoop" ||
    category === "melodicLoop" ||
    category === "bassLoop" ||
    category === "voxLoop" ||
    category === "fxLoop"
  );
}

/** A bare DRUM or LOOP is never a usable selection; a specific drum Type implies DRUM. */
export function validTypeSelection(types: readonly string[]): boolean {
  const drums = [
    "kick",
    "snare",
    "clap",
    "closedHat",
    "openHat",
    "cymbal",
    "perc",
  ];
  const drum = types.includes("DRUM") || types.some((t) => drums.includes(t));
  const loop = types.includes("LOOP");
  const family = types.some((t) =>
    ["MELODIC", "BASS", "VOX", "FX"].includes(t),
  );
  return (
    (family || (drum && (loop || types.some((t) => drums.includes(t))))) &&
    !(drum && family)
  );
}
