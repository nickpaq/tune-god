import type { CategoryId } from "./classify";

export interface SampleClassification {
  category: CategoryId;
  subtype?: string;
  confidence: number;
  needsReview: boolean;
  evidence: "correction" | "folder" | "filename" | "metadata" | "unknown";
}

/** Detailed vocabulary stays separate from the stable, visible allocation Types. */
export const SUBTYPES: Partial<Record<CategoryId, string[]>> = {
  kick: ["acoustic", "electronic", "808", "sub"],
  snare: ["acoustic", "electronic", "rimshot", "sidestick"],
  closedHat: ["closed", "pedal", "roll"],
  openHat: ["open", "roll"],
  cymbal: ["crash", "ride", "splash", "china"],
  perc: ["shaker", "tambourine", "tom", "conga", "bongo", "clave", "cowbell"],
  bass: ["808", "sub", "synth bass", "electric bass"],
  bassLoop: ["808", "sub", "synth bass", "electric bass"],
  melodic: ["piano", "guitar", "synth", "strings", "horn", "stab"],
  melodicLoop: ["piano", "guitar", "synth", "strings", "horn", "stab"],
  vox: ["chop", "phrase", "hit"],
  voxLoop: ["chop", "phrase"],
  fx: ["impact", "sweep", "whoosh", "glitch", "transition", "noise"],
  riser: ["riser", "uplifter"],
  fall: ["noise fall", "fall", "downlifter"],
  fxLoop: ["sweep", "whoosh", "glitch", "transition", "noise"],
};

export function subtypeOf(
  category: CategoryId,
  path: string,
): string | undefined {
  const words = path.replace(/[_\-.()[\]/]+/g, " ").toLowerCase();
  const aliases: Record<string, string> = {
    rimshot: "rim(?:shot| shot)?s?",
    sidestick: "side ?sticks?",
    tambourine: "tamb(?:ourine)?s?",
    horn: "(?:horns?|brass)",
    strings: "(?:strings?|violins?|cellos?)",
    roll: "rolls?",
    "noise fall": "noise falls?",
  };
  return SUBTYPES[category]?.find((subtype) =>
    new RegExp(`\\b${aliases[subtype] ?? subtype + "s?"}\\b`).test(words),
  );
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

/** A bare DRUM or LOOP is never a usable selection; a drum subtype implies DRUM. */
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
