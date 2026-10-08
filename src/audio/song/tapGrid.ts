// The grid made by tapping along, and the sections cut along its lines. The grid is a row of numbered lines (one per beat). Each stretch of lines has
// its own steady spacing (a tempo segment: tapping again later in the song starts a new one), any line can be nudged on its own, and the lines that
// are the first beat of a bar are the ones set as 1.1.1 and every bar after them. Sections are picked from one line to another, never more than 16 bars.
// Pure arithmetic, so the cuts can be tested to the frame: they are rendered into files and cannot be corrected afterwards.
import type { SectionPlan } from "./chop";

/** From line `line` on (until the next segment) the lines are `beatFrames` apart, line `line` being on `frame`. */
export interface TempoSegment {
  line: number;
  frame: number;
  beatFrames: number;
}

export interface TapGrid {
  sampleRate: number;
  /** Beats in a bar: the project's time signature numerator. */
  beatsPerBar: number;
  /** In line order, never empty. The first one carries on backwards before its line. */
  segments: readonly TempoSegment[];
  /** Lines moved by hand, by line number: how many frames from where the steady spacing puts them. */
  offsets: Readonly<Record<number, number>>;
  /** The lines set as 1.1.1, in order. A bar starts on each of them and every `beatsPerBar` lines after, until the next one. */
  downbeats: readonly number[];
}

/** No section is longer than this many bars. */
export const MAX_SECTION_BARS = 16;

/** The most beats a section may hold. */
export const maxBeats = (grid: TapGrid): number => MAX_SECTION_BARS * grid.beatsPerBar;

/** The segment line `n` belongs to. */
function segmentOf(grid: TapGrid, n: number): TempoSegment {
  let found = grid.segments[0];
  for (const s of grid.segments) if (s.line <= n) found = s;
  return found;
}

/** The frame of line `n`: the steady spacing of its segment, plus whatever it was nudged by. */
export function lineFrame(grid: TapGrid, n: number): number {
  const s = segmentOf(grid, n);
  return s.frame + (n - s.line) * s.beatFrames + (grid.offsets[n] ?? 0);
}

/** Frames from one line to the next where line `n` is. */
export function beatFramesAt(grid: TapGrid, n: number): number {
  return segmentOf(grid, n).beatFrames;
}

/** The tempo at line `n`, in BPM. */
export function bpmAt(grid: TapGrid, n: number): number {
  return (60 * grid.sampleRate) / beatFramesAt(grid, n);
}

/** The number of the line nearest `frame` by the steady spacing (a line nudged a little still belongs to the same number). */
export function lineNear(grid: TapGrid, frame: number): number {
  let s = grid.segments[0];
  for (const next of grid.segments) if (next.frame <= frame) s = next;
  const n = s.line + Math.round((frame - s.frame) / s.beatFrames);
  // The line a segment's neighbour owns is not this segment's to give.
  const after = grid.segments.find((x) => x.line > s.line);
  return after && n >= after.line ? after.line - 1 : n;
}

/** Steps (sixteenth notes) to a beat: the finest the chopper's grid and chops go. */
export const STEPS_PER_BEAT = 4;

/** The position nearest `frame` on the grid of `perBeat` divisions to a beat (16ths by default), as a line number with a fraction (3.25 is a sixteenth after line 3). */
export function fineLineNear(grid: TapGrid, frame: number, perBeat = STEPS_PER_BEAT): number {
  const n = lineNear(grid, frame);
  let best = n;
  let distance = Infinity;
  for (let k = (n - 1) * perBeat; k <= (n + 1) * perBeat; k++) {
    const d = Math.abs(lineFrame(grid, k / perBeat) - frame);
    if (d < distance) {
      distance = d;
      best = k / perBeat;
    }
  }
  return best;
}

/** The numbers of the lines that fall between two frames, nudged lines included, in order. */
export function linesBetween(grid: TapGrid, from: number, to: number): number[] {
  const lines: number[] = [];
  grid.segments.forEach((s, i) => {
    const lo = i === 0 ? -Infinity : s.line;
    const hi = i + 1 < grid.segments.length ? grid.segments[i + 1].line - 1 : Infinity;
    // A nudge is a fraction of a beat at most in practice; looking a beat either side keeps a nudged line that has moved into view.
    const first = Math.max(lo, s.line + Math.floor((from - s.frame) / s.beatFrames) - 1);
    const last = Math.min(hi, s.line + Math.ceil((to - s.frame) / s.beatFrames) + 1);
    for (let n = first; n <= last; n++) {
      const frame = lineFrame(grid, n);
      if (frame >= from && frame <= to) lines.push(n);
    }
  });
  return lines;
}

/** The same grid with line `n` moved by `frames` (one line only). */
export function nudgeLine(grid: TapGrid, n: number, frames: number): TapGrid {
  const offset = (grid.offsets[n] ?? 0) + frames;
  const offsets = { ...grid.offsets };
  if (Math.abs(offset) < 1e-9) delete offsets[n];
  else offsets[n] = offset;
  return { ...grid, offsets };
}

/** The same grid with line `n` put on `frame`. */
export function placeLine(grid: TapGrid, n: number, frame: number): TapGrid {
  return nudgeLine(grid, n, frame - lineFrame(grid, n));
}

/** The same grid with line `n` back on the steady spacing. */
export function resetLine(grid: TapGrid, n: number): TapGrid {
  const offsets = { ...grid.offsets };
  delete offsets[n];
  return { ...grid, offsets };
}

/** The whole grid moved by `frames`, every nudge with it: a tap that always lands a little late or early is put right in one go. */
export function shiftGrid(grid: TapGrid, frames: number): TapGrid {
  return { ...grid, segments: grid.segments.map((s) => ({ ...s, frame: s.frame + frames })) };
}

/**
 * Tapping again later in the song: from the line nearest `at.origin` on, the lines follow the new tempo and phase (`origin` and `beatFrames` in
 * frames). Everything before that line stays as it was; the lines nudged by hand after it, and any segment after it, are replaced.
 */
export function realignGrid(grid: TapGrid, at: { origin: number; beatFrames: number }): TapGrid {
  const line = lineNear(grid, at.origin);
  const offsets: Record<number, number> = {};
  for (const [n, frames] of Object.entries(grid.offsets)) if (Number(n) < line) offsets[Number(n)] = frames;
  const segments = [...grid.segments.filter((s) => s.line < line), { line, frame: at.origin, beatFrames: at.beatFrames }];
  return { ...grid, segments, offsets };
}

/** The downbeats with line `n` set as 1.1.1 (replacing one already on it). */
export function setDownbeat(grid: TapGrid, n: number): TapGrid {
  return { ...grid, downbeats: [...new Set([...grid.downbeats, n])].sort((a, b) => a - b) };
}

/** Whether line `n` is the first beat of a bar: counted from the last 1.1.1 at or before it, or backwards from the first one if it is before them all. */
export function isBarLine(grid: TapGrid, n: number): boolean {
  if (grid.downbeats.length === 0) return false;
  let anchor = grid.downbeats[0];
  for (const d of grid.downbeats) if (d <= n) anchor = d;
  return (((n - anchor) % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar === 0;
}

/** A section picked on the grid: from line `first` to line `last`. */
export interface PickedSection {
  first: number;
  last: number;
  /** Which colour of the palette it was given when it was put in the list (kept, so it is the same whatever the order). */
  colorIndex: number;
}

/**
 * Where a line `line` dragged to lands as the far end of a section that is anchored on line `anchor`: not the anchor itself, and not more than
 * `limit` lines away (a section is never longer than 16 bars).
 */
export function limitEnd(anchor: number, line: number, limit: number): number {
  const farthest = Math.min(anchor + limit, Math.max(anchor - limit, line));
  return farthest === anchor ? anchor : farthest;
}

/** The sections, in song order. */
export const inOrder = <T extends { first: number }>(sections: readonly T[]): T[] => [...sections].sort((a, b) => a.first - b.first);

/**
 * The sections in the shape the export reads, in song order: each runs from its first line to its last, exactly (the frames are rounded from the
 * lines' own positions). `bars` is the length in whole bars, at least one, for its pattern; a section that is not a whole number of bars is still cut
 * where the lines are.
 */
export function planSections(totalFrames: number, grid: TapGrid, sections: readonly PickedSection[]): SectionPlan[] {
  const plans: SectionPlan[] = [];
  for (const s of inOrder(sections)) {
    const start = Math.round(lineFrame(grid, s.first));
    const end = Math.round(lineFrame(grid, s.last));
    if (end <= start || end <= 0 || start >= totalFrames) continue;
    const audioFrames = Math.max(0, Math.min(end, totalFrames) - Math.max(start, 0));
    plans.push({ start, length: end - start, bars: Math.max(1, Math.round((s.last - s.first) / grid.beatsPerBar)), audioFrames, index: plans.length, barIndex: Math.floor(s.first / grid.beatsPerBar), colorIndex: s.colorIndex });
  }
  return plans;
}

/** Sections that are not a whole number of bars (by their number in song order, 1-based), for a warning: the export holds each for whole bars. */
export function oddSections(grid: TapGrid, sections: readonly PickedSection[]): number[] {
  const odd: number[] = [];
  inOrder(sections).forEach((s, i) => {
    if ((s.last - s.first) % grid.beatsPerBar !== 0) odd.push(i + 1);
  });
  return odd;
}

/** The sections on audio at another sample rate: every position scales with it. */
export function scalePlans(plans: readonly SectionPlan[], from: number, to: number): SectionPlan[] {
  const ratio = to / from;
  return plans.map((p) => {
    const start = Math.round(p.start * ratio);
    const length = Math.round((p.start + p.length) * ratio) - start;
    return { ...p, start, length, audioFrames: Math.round(p.audioFrames * ratio) };
  });
}
