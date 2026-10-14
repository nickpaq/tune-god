import { isKitCategory, type CategoryId } from "./classify";

/** Melodic loops require both their canonical Type and a source in the selected packs. */
export function eligibleHotSwapSound(
  sound: { category?: CategoryId; libraryId?: string; sourcePath?: string; locked?: boolean },
  slotCategory: CategoryId | undefined,
  selectedSources: ReadonlySet<string> | null = null,
): boolean {
  if (sound.locked) return false;
  if (!(isKitCategory(slotCategory) ? isKitCategory(sound.category) : sound.category === slotCategory)) return false;
  return slotCategory !== "melodicLoop" || selectedSources === null ||
    (sound.libraryId !== undefined && selectedSources.has(sound.libraryId)) ||
    (sound.sourcePath !== undefined && selectedSources.has(sound.sourcePath));
}
