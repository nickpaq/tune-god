import type { CategoryId } from "../audio/classify";

/**
 * The sound types as a device faceplate: two dark plates of the same width, each a grid of five equal columns, so every
 * key lines up with the one above it. Drums, percussion, vox and drum loops fill the upper plate; melodic sounds, bass
 * and the odds and ends sit on the lower one, mirrored around the bass. Each key is a tab of translucent plastic in its
 * type's palette colour, on a black panel, so neighbouring types read as one run of colour.
 */
export const PLATES: { name: string; ids: CategoryId[] }[] = [
  { name: "Drums", ids: ["kick", "snare", "clap", "closedHat", "openHat", "cymbal", "vox", "perc", "drumLoop", "percLoop"] },
  { name: "Melodic, bass and other", ids: ["melodic", "melodicLoop", "bass", "fx", "other"] },
];
