import type { CategoryId } from "./classify";
import { categoryLabel } from "./classify";
import type { Pad } from "../components/PadPanel";
import { makePlaceholderPad } from "./placeholderPads";

/** A corrected sound becomes a spare; its slot keeps the original requested Type. */
export function replaceCorrectedPad(
  pads: Record<number, Pad>,
  hidden: Record<number, Pad>,
  corrected: Pad,
  intended: CategoryId,
): { pads: Record<number, Pad>; hidden: Record<number, Pad>; replacement: Pad | null } {
  if (corrected.locked) return { pads: { ...pads, [corrected.index]: corrected }, hidden, replacement: null };
  const activeIds = new Set(Object.values(pads).filter(p => p.index !== corrected.index && p.libraryId).map(p => p.libraryId));
  const spare = Object.values(hidden).find(p => p.category === intended && !p.locked && p.origIndex !== corrected.origIndex && (!p.libraryId || !activeIds.has(p.libraryId)));
  const nextHidden = { ...hidden, [corrected.origIndex]: { ...corrected, index: -1 } };
  if (spare) delete nextHidden[spare.origIndex];
  const replacement = spare ? { ...spare, index: corrected.index } : null;
  return {
    pads: { ...pads, [corrected.index]: replacement ?? makePlaceholderPad({ index: corrected.index, kind: "missing", label: `add ${categoryLabel(intended)}` }) },
    hidden: nextHidden,
    replacement,
  };
}
