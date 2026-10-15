import { isKitCategory, type CategoryId } from "./classify";

/** A sound needs a matching Type and, when packs are selected, a source inside them. With every pack selected (`null`) everything in the library qualifies. */
export function eligibleHotSwapSound(
  sound: { category?: CategoryId; libraryId?: string; sourcePath?: string; locked?: boolean },
  slotCategory: CategoryId | undefined,
  selectedSources: ReadonlySet<string> | null = null,
): boolean {
  if (sound.locked) return false;
  if (!(isKitCategory(slotCategory) ? isKitCategory(sound.category) : sound.category === slotCategory)) return false;
  return selectedSources === null ||
    (sound.libraryId !== undefined && selectedSources.has(sound.libraryId)) ||
    (sound.sourcePath !== undefined && selectedSources.has(sound.sourcePath));
}
