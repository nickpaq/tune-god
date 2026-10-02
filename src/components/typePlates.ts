import type { CategoryId } from "../audio/classify";

/**
 * The sound types as a device faceplate: two dark plates of the same width, each a grid of five equal columns, so every
 * key lines up with the one above it. Drums, percussion, vox and drum loops fill the upper plate; melodic sounds, bass
 * and the odds and ends sit on the lower one, mirrored around the bass. Every key is the same neutral cap with a small
 * light in its type's palette colour: colour marks the type, it is not painted over the controls.
 */
export const PLATES: { name: string; ids: CategoryId[] }[] = [
  { name: "Drums", ids: ["kick", "snare", "clap", "closedHat", "openHat", "cymbal", "vox", "perc", "drumLoop", "percLoop"] },
  { name: "Melodic, bass and other", ids: ["melodic", "melodicLoop", "bass", "fx", "other"] },
];
