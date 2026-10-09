// The chop editor's model: a beat grid found by the automatic detection, two kinds of marker the user places at the cursor, and an undo history.
// Chop markers delimit sections. One anchor locks the grid to the audio and serves as the pivot for BPM changes.
// Markers are kept as the frames they were placed on and the grid and the cuts are worked out from them, so undo is just going back to earlier markers.
import {
  isBarLine,
  lineFrame,
  lineNear,
  fineLineNear,
  MAX_SECTION_BARS,
  type PickedSection,
  type TapGrid,
} from "./tapGrid";

/** What the user has placed, as the frames of the song they were placed on (the cursor's position at the time), in the order they were placed. */
export interface Marks {
  chops: readonly number[];
  /** Whole-grid phase nudge, in source frames; independent of detection input and tempo. */
  gridOffsetFrames?: number;
  /** Legacy downbeat markers, read only for saved-project compatibility. */
  downbeats: readonly number[];
  /** Exact phase anchor; the legacy property name keeps saved projects compatible. */
  oneOne: number | null;
  /** The detected tempo is taken this many times over (2 for double time, 0.5 for half time). */
  tempoScale: number;
  /** A tempo set by hand (double tap to snap, drag to scrub): the grid's tempo exactly, overriding automatic detection. Null uses Music Tempo. */
  bpm?: number | null;
}

export const NO_MARKS: Marks = { chops: [], downbeats: [], oneOne: null, tempoScale: 1, bpm: null };

/** The grid the detection found: a line for every beat, bar 1 on line 0. */
export function baseGrid(sampleRate: number, beatsPerBar: number, bpm: number, downbeatSeconds: number): TapGrid {
  return {
    sampleRate,
    beatsPerBar,
    segments: [{ line: 0, frame: downbeatSeconds * sampleRate, beatFrames: (60 * sampleRate) / bpm }],
    offsets: {},
    downbeats: [0],
  };
}

/** Apply an exact phase anchor without estimating tempo from marker spacing.
 * Legacy downbeat markers are read for compatibility; the last one supplies the anchor
 * only when no explicit anchor exists. No anchor ever changes the detected BPM.
 */
export function gridWithMarks(base: TapGrid, marks: Pick<Marks, "downbeats" | "oneOne" | "tempoScale" | "bpm" | "gridOffsetFrames">): TapGrid {
  const byHand = marks.bpm != null && marks.bpm > 0;
  const beatFrames = byHand ? (60 * base.sampleRate) / marks.bpm! : base.segments[0].beatFrames / marks.tempoScale;
  const anchor = marks.oneOne ?? marks.downbeats.at(-1) ?? null;
  const offset = marks.gridOffsetFrames ?? 0;
  if (anchor === null && marks.tempoScale === 1 && !byHand && offset === 0) return base;
  return {
    ...base,
    segments: [{ line: 0, frame: (anchor ?? base.segments[0].frame) + offset, beatFrames }],
    offsets: {},
    downbeats: [0],
  };
}

/** The first beat of the bar nearest `frame`. */
export function barLineNear(grid: TapGrid, frame: number): number {
  const near = lineNear(grid, frame);
  let best = near;
  let distance = Infinity;
  for (let n = near - grid.beatsPerBar; n <= near + grid.beatsPerBar; n++) {
    if (!isBarLine(grid, n)) continue;
    const d = Math.abs(lineFrame(grid, n) - frame);
    if (d < distance) {
      distance = d;
      best = n;
    }
  }
  return best;
}

/** The bar lines the chop markers sit on, in song order (two markers on one bar line are one). */
export function chopLines(grid: TapGrid, chops: readonly number[]): number[] {
  return [...new Set(chops.map((frame) => barLineNear(grid, frame)))].sort((a, b) => a - b);
}

/** The positions the chop markers sit on when chops may go as fine as sixteenth notes (chopper mode), in song order (two markers on one sixteenth are one). */
export function fineChopLines(grid: TapGrid, chops: readonly number[]): number[] {
  return [...new Set(chops.map((frame) => fineLineNear(grid, frame)))].sort((a, b) => a - b);
}

/** The sections between neighbouring chop markers, in song order, each given the palette colour of its place in the list. */
export function sectionsBetween(lines: readonly number[]): PickedSection[] {
  const sections: PickedSection[] = [];
  for (let i = 0; i + 1 < lines.length; i++) sections.push({ first: lines[i], last: lines[i + 1], colorIndex: i });
  return sections;
}

/** The length of a section in bars (a fraction where a downbeat marker splits a bar). */
export const barsIn = (grid: TapGrid, s: PickedSection): number => (s.last - s.first) / grid.beatsPerBar;

/** Whether a section is longer than a pattern can hold. */
export const tooLong = (grid: TapGrid, s: PickedSection): boolean => barsIn(grid, s) > MAX_SECTION_BARS;

/**
 * The marker of a list that sits at the cursor, if any: the one nearest `frame` within `tolerance` frames. Pressing a marker's button where one already
 * is takes it away.
 */
export function markerAt(list: readonly number[], frame: number, tolerance: number): number | null {
  let best: number | null = null;
  let distance = tolerance;
  for (const m of list) {
    const d = Math.abs(m - frame);
    if (d <= distance) {
      distance = d;
      best = m;
    }
  }
  return best;
}

/** A history that can be stepped back and forward. */
export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** A change made: the old state can be gone back to, and whatever was undone is forgotten. */
export const commit = <T>(h: History<T>, next: T): History<T> => ({ past: [...h.past, h.present], present: next, future: [] });

export const undo = <T>(h: History<T>): History<T> =>
  h.past.length === 0 ? h : { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };

export const redo = <T>(h: History<T>): History<T> =>
  h.future.length === 0 ? h : { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };

/** One anchor: snap chooses an existing beat; free placement uses the exact playhead frame. */
export function anchorAtPlayhead(grid: TapGrid, cursor: number, snap: boolean, lastFrame = Infinity): number {
  if (!snap) return Math.max(0, Math.min(lastFrame, Math.round(cursor)));
  const near = lineNear(grid, cursor);
  const frame = lineFrame(grid, near);
  const beatFrames = grid.segments[0].beatFrames;
  if (frame < 0) return lineFrame(grid, near + Math.ceil(-frame / beatFrames));
  if (frame > lastFrame) return lineFrame(grid, near - Math.ceil((frame - lastFrame) / beatFrames));
  return frame;
}

/** A nudge changes only phase and does not trigger a new analysis. */
export function nudgeGridMarks(marks: Marks, sampleRate: number, direction: -1 | 1): Marks {
  return { ...marks, gridOffsetFrames: (marks.gridOffsetFrames ?? 0) + direction * sampleRate * 0.001 };
}
