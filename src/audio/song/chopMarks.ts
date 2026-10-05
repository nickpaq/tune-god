// The chop editor's model: a beat grid found by the automatic detection, two kinds of marker the user places at the cursor, and an undo history.
// Chop markers say where a section starts or ends; downbeat markers say where a bar starts, to lock the grid back in where it has gone out of sync.
// Markers are kept as the frames they were placed on and the grid and the cuts are worked out from them, so undo is just going back to earlier markers.
import {
  beatFramesAt,
  isBarLine,
  lineFrame,
  lineNear,
  MAX_SECTION_BARS,
  realignGrid,
  setDownbeat,
  type PickedSection,
  type TapGrid,
} from "./tapGrid";

/** What the user has placed, as the frames of the song they were placed on (the cursor's position at the time), in the order they were placed. */
export interface Marks {
  chops: readonly number[];
  downbeats: readonly number[];
}

export const NO_MARKS: Marks = { chops: [], downbeats: [] };

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

/**
 * The detected grid with the downbeat markers applied, earliest first. A marker starts a new stretch of the grid at its own frame (same tempo), so the
 * lines after it sit on it, and makes the nearest line a bar's first beat. Once there are markers the detection's own bar 1 is dropped: the bars before
 * the first marker are counted back from it.
 */
export function gridWithDownbeats(base: TapGrid, downbeats: readonly number[]): TapGrid {
  let grid: TapGrid = downbeats.length > 0 ? { ...base, downbeats: [] } : base;
  for (const frame of [...downbeats].sort((a, b) => a - b)) {
    const beatFrames = beatFramesAt(grid, lineNear(grid, frame));
    grid = realignGrid(grid, { origin: frame, beatFrames });
    grid = setDownbeat(grid, lineNear(grid, frame));
  }
  return grid;
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
