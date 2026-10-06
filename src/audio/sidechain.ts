// When the bass can duck to the kick. The sidechain compressor sits on the bass bus and listens to the kick bus (see routing.ts and
// setupMixer in exportProject.ts), so it only does something while a kick and a bass are on the pads. Hot swaps and a new drum kit change
// what is on the pads, so this is worked out again from the pads every time: the buses themselves are assigned from each pad's type at export.
import type { CategoryId } from "./classify";

export type SidechainBlocker = "organize" | "kick" | "bass";

export interface SidechainStatus {
  hasKick: boolean;
  hasBass: boolean;
  /** Everything the sidechain needs is there: Organize is on (it routes the buses) and the pads hold a kick and a bass or 808. */
  ready: boolean;
  /** What is missing first, for the menu to say; null when ready. */
  blocker: SidechainBlocker | null;
}

/** `categories` are the types of the real sounds on the pads (not hot-swap spares, ghost copies or silent placeholders). */
export function sidechainStatus(categories: (CategoryId | undefined)[], organizeOn: boolean): SidechainStatus {
  const hasKick = categories.includes("kick");
  const hasBass = categories.includes("bass");
  const blocker: SidechainBlocker | null = !organizeOn ? "organize" : !hasKick ? "kick" : !hasBass ? "bass" : null;
  return { hasKick, hasBass, ready: blocker === null, blocker };
}

export const SIDECHAIN_HINT: Record<SidechainBlocker | "ready", string> = {
  ready: "The bass and 808 duck to the kick",
  organize: "Turn Organize on first. The sidechain also needs a kick and a bass or 808 on the pads",
  kick: "Load a drum kit with a kick first",
  bass: "Load a bass or 808 first",
};
