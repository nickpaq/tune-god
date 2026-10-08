// The chop editor's model: a beat grid found by the automatic detection, two kinds of marker the user places at the cursor, and an undo history.
// Chop markers say where a section starts or ends; downbeat markers say where a bar starts, to lock the grid back in where it has gone out of sync.
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
  /** Where a bar starts, to lock the grid in. They do not say where the song's bar 1 is. */
  downbeats: readonly number[];
  /** The 1.1.1: where the song's bars are counted from. It can sit before the first downbeat marker. Null leaves the detection's own bar 1. */
  oneOne: number | null;
  /** The detected tempo is taken this many times over (2 for double time, 0.5 for half time). */
  tempoScale: number;
  /** A tempo set by hand (double tap to snap, drag to scrub): the grid's tempo exactly, ahead of the detection, the markers' fit and the drift correction. Null leaves them in charge. */
  bpm?: number | null;
}

export const NO_MARKS: Marks = { chops: [], downbeats: [], oneOne: null, tempoScale: 1, bpm: null };

/** How far the tempo fitted through the markers may stray from the detected one (a ratio), so a stray marker cannot bend the grid. */
const FIT_RANGE = 0.15;

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
 * The grid with the markers applied. Every downbeat marker is an anchor: a frame where a bar starts. The 1.1.1 is one too, always, and exactly where it was
 * put (it is free: nothing snaps it to an attack or to a bar line, so a bar line lies on it). The first anchor is where bars are
 * counted from, and the lines tile backwards from it as well as forwards (a 1.1.1 set midway through the song gives the intro its grid too). With one
 * anchor the grid keeps the detected tempo. With more, the tempo is fitted through all of them (a straight line through anchor frame against bars
 * counted, so the BPM homes in on the exact one as markers are added) and is a single tempo for the whole song; each anchor then re-locks the phase from
 * there, which only ever moves the lines by the little the fitted tempo is out. With no anchor the detection's own bar 1 and tempo stand.
 */
export function gridWithMarks(base: TapGrid, marks: Pick<Marks, "downbeats" | "oneOne" | "tempoScale" | "bpm">): TapGrid {
  const bpb = base.beatsPerBar;
  const byHand = marks.bpm != null && marks.bpm > 0;
  const detected = byHand ? (60 * base.sampleRate) / marks.bpm! : base.segments[0].beatFrames / marks.tempoScale;
  // The 1.1.1 is always an anchor, exactly where it was put (no snapping to an attack or a bar line), so a bar line lies on it whatever else is set.
  // A tempo changed by hand (or halved or doubled) turns the grid about it: it stays on its place in the waveform and every other line moves.
  const one = marks.oneOne;
  const frames = [...new Set(one === null ? marks.downbeats : [one, ...marks.downbeats])].sort((a, b) => a - b);
  if (frames.length === 0) return marks.tempoScale === 1 && !byHand ? base : { ...base, segments: [{ ...base.segments[0], beatFrames: detected }] };

  let beat = detected;
  const anchors = [{ bars: 0, frame: frames[0] }];
  for (const frame of frames.slice(1)) {
    const last = anchors[anchors.length - 1];
    // Whole bars from the last anchor, by the tempo so far (a marker less than half a bar on from one is the same bar, and is left out).
    const bars = Math.round((frame - last.frame) / (beat * bpb));
    // (a downbeat marker that close to the 1.1.1 gives way to it: the 1.1.1 stays exact)
    if (bars < 1) {
      if (frame === one) last.frame = frame;
      continue;
    }
    anchors.push({ bars: last.bars + bars, frame });
    // The tempo fitted through every anchor so far (a tempo set by hand stays).
    if (byHand) continue;
    const n = anchors.length;
    const meanX = anchors.reduce((t, a) => t + a.bars, 0) / n;
    const meanY = anchors.reduce((t, a) => t + a.frame, 0) / n;
    const slope = anchors.reduce((t, a) => t + (a.bars - meanX) * (a.frame - meanY), 0) / anchors.reduce((t, a) => t + (a.bars - meanX) ** 2, 0);
    beat = Math.min(detected * (1 + FIT_RANGE), Math.max(detected * (1 - FIT_RANGE), slope / bpb));
  }
  return {
    ...base,
    segments: anchors.map((a) => ({ line: a.bars * bpb, frame: a.frame, beatFrames: beat })),
    offsets: {},
    downbeats: anchors.map((a) => a.bars * bpb),
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
