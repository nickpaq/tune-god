import { fineLineNear, lineFrame, type TapGrid } from "./tapGrid";
import type { WorkspaceState } from "./sectionWorkspace";
import { slotStarts, type MakerChop, type Slot } from "./patternMaker";
export interface RhythmPattern {
  bars: number;
  markers: number[];
  enabled: boolean;
}
export function rhythmMarkers(markers: number[], span: number) {
  return [
    ...new Set([
      0,
      ...markers
        .filter((n) => Number.isInteger(n) && n >= 0 && n < 16)
        .map((n) => (n * span) / 16),
    ]),
  ].sort((a, b) => a - b);
}
/** Markers start pieces; empty steps extend the preceding piece, never imply silence. */
export function rhythmLength(
  markers: number[],
  span: number,
  at: number,
): number {
  const phase = ((at % span) + span) % span;
  return (
    (rhythmMarkers(markers, span).find((n) => n > phase + 1e-8) ?? span) - phase
  );
}
/** Fill the song with original slices at repeated rhythm boundaries, preserving any prior substitutions. */
export function applyRhythm(
  state: WorkspaceState,
  rhythm: RhythmPattern,
  grid: TapGrid,
  totalFrames: number,
  colors: readonly string[] = ["#ce7b63", "#bbad78", "#76a89b", "#8e96bd"],
): WorkspaceState {
  if (!rhythm.enabled || !rhythm.markers.length) return { ...state, rhythm };
  const span = rhythm.bars * grid.beatsPerBar * 4;
  const sourceSteps = Math.max(0, fineLineNear(grid, totalFrames, 48) * 4);
  const chops = state.chops.slice();
  const slots: Slot[] = [];
  const oldStarts = slotStarts(state.slots).starts;
  let oldIndex = 0;
  for (let at = 0; at < sourceSteps - 1e-8;) {
    const steps = rhythmLength(rhythm.markers, span, at);
    while (
      oldIndex + 1 < oldStarts.length &&
      oldStarts[oldIndex + 1] <= at + 1e-8
    )
      oldIndex++;
    const prior = state.slots[oldIndex];
    const covers = prior && at < oldStarts[oldIndex] + prior.steps - 1e-8;
    if (covers && prior.kind === "silence")
      slots.push({ kind: "silence", steps });
    else {
      const sourceAt =
        covers && prior.kind === "chop"
          ? fineLineNear(grid, state.chops[prior.chop].start, 48) * 4 +
            at -
            oldStarts[oldIndex]
          : at;
      const start = Math.max(
        0,
        Math.min(totalFrames - 1, Math.round(lineFrame(grid, sourceAt / 4))),
      );
      const end = Math.min(
        totalFrames,
        Math.round(lineFrame(grid, (sourceAt + steps) / 4)),
      );
      const barIndex = Math.floor(sourceAt / (grid.beatsPerBar * 4));
      const colorIndex = ((barIndex % 4) + 4) % 4;
      const candidate: MakerChop = {
        slice: chops.length,
        start,
        length: Math.max(1, end - start),
        steps,
        bars: steps / (grid.beatsPerBar * 4),
        barIndex,
        colorIndex,
        color: colors[colorIndex],
      };
      let chop = chops.findIndex(
        (c) =>
          c.start === start &&
          c.steps === steps &&
          c.length === candidate.length,
      );
      if (chop < 0) {
        chop = chops.length;
        chops.push(candidate);
      }
      slots.push({ kind: "chop", chop, steps });
    }
    at += steps;
  }
  return { ...state, chops, slots, rhythm };
}
