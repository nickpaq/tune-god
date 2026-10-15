// When the sidechain can be written. Koala's SIDECHAIN goes on the Bass bus and listens to the Kick bus (see mixerChain.ts), so the pads need a kick
// and a bass or 808. Hot swaps and a new drum kit change what is on the pads, so this is worked out again from the pads every time.
import type { CategoryId } from "./classify";

export type SidechainBlocker = "kick" | "bass";

export interface SidechainStatus {
  hasKick: boolean;
  hasBass: boolean;
  /** The pads hold a kick and a bass or 808. */
  ready: boolean;
  /** What is missing first, for the export dialog to say; null when ready. */
  blocker: SidechainBlocker | null;
}

/** `categories` are the types of the real sounds on the pads (not hot-swap spares, ghost copies or silent placeholders). */
export function sidechainStatus(categories: (CategoryId | undefined)[]): SidechainStatus {
  const hasKick = categories.includes("kick");
  const hasBass = categories.includes("bass") || categories.includes("bassLoop");
  const blocker: SidechainBlocker | null = !hasKick ? "kick" : !hasBass ? "bass" : null;
  return { hasKick, hasBass, ready: blocker === null, blocker };
}

export const SIDECHAIN_HINT: Record<SidechainBlocker | "ready", string> = {
  ready: "The bass and 808s duck under the kick (Koala's sidechain on the Bass bus, listening to the Kick bus). Turns on bus routing.",
  kick: "Load a drum kit with a kick first",
  bass: "Load a bass or 808 first",
};
