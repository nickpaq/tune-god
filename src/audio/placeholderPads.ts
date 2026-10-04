// The silent pads a finger-drumming layout adds: "add <role>" marks a gap inside a kit, and
// "Empty pad" fills every other free spot. Both are real pads in the exported project, each with a
// tiny silent WAV.
import type { Pad } from "../components/PadPanel";
import type { ArrangePlaceholder } from "./fingerDrumming";

/** Koala's dark grey background, which "missing" pads use so a gap reads as dark. */
export const MISSING_PAD_COLOR = "#2E2B2B";
/** The app's background colour, which "Empty pad" uses so it looks translucent. */
export const EMPTY_PAD_COLOR = "#2D111D";

export const PLACEHOLDER_SAMPLE_RATE = 44100;
/** Length of a placeholder's silent audio. */
export const PLACEHOLDER_SECONDS = 0.002;
export const PLACEHOLDER_FRAMES = Math.round(PLACEHOLDER_SAMPLE_RATE * PLACEHOLDER_SECONDS);

/** Placeholder pads have no project slot, so their stable id sits above the 64 real ones. */
const PLACEHOLDER_ORIG_BASE = 1000;

export function makePlaceholderPad(p: ArrangePlaceholder): Pad {
  return {
    index: p.index,
    origIndex: PLACEHOLDER_ORIG_BASE + p.index,
    name: p.label,
    sampleId: 0,
    sampleRate: PLACEHOLDER_SAMPLE_RATE,
    channelData: [new Float32Array(PLACEHOLDER_FRAMES)],
    tune: false,
    semis: 0,
    cents: 0,
    placeholder: { kind: p.kind, label: p.label },
  };
}

export function placeholderColor(pad: Pad): string {
  return pad.placeholder?.kind === "empty" ? EMPTY_PAD_COLOR : MISSING_PAD_COLOR;
}

