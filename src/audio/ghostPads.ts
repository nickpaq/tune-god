import type { Pad } from "../components/PadPanel";
import { GHOST_LABEL, makeGhostAudio, type GhostKind } from "./ghost";

/** Ghost pads have no project slot, so their stable id sits above the placeholders' (see placeholderPads.ts). */
const GHOST_ORIG_BASE = 2000;

/** A pad holding a quieter, duller copy of `source`, for a ghost snare or soft kick slot. */
export function makeGhostPad(index: number, kind: GhostKind, source: Pad): Pad {
  return {
    index,
    origIndex: GHOST_ORIG_BASE + index,
    name: `${GHOST_LABEL[kind]} (${source.name})`,
    sampleId: 0,
    sampleRate: source.sampleRate,
    channelData: makeGhostAudio(source.channelData, source.sampleRate, kind),
    category: source.category,
    tune: false,
    semis: 0,
    cents: 0,
    ghost: { kind, sourceOrigIndex: source.origIndex },
  };
}
