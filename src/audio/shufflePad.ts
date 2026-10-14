import type { CategoryId } from "./classify";

interface ShuffleSound {
  origIndex: number;
  category?: CategoryId;
  libraryId?: string;
  locked?: boolean;
}

/** Shuffle from hot swap using the same Type. */
export function chooseShuffleSound<T extends ShuffleSound>(target: T, candidates: T[], rng: () => number = Math.random): T | undefined {
  if (target.locked || !target.category) return;
  const seen = new Set<string>();
  const pool = candidates.filter((sound) => {
    if (sound.locked || sound.origIndex === target.origIndex || (target.libraryId && sound.libraryId === target.libraryId)) return false;
    if (sound.category !== target.category) return false;
    const id = sound.libraryId ?? `pad:${sound.origIndex}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] : undefined;
}
