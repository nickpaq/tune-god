// The grid made by tapping along, and the sections cut along its lines. The grid is a row of numbered lines (one per beat) at a steady spacing, any
// of which can be nudged on its own. The user picks lines as cuts: the first is bar 1, and every section runs from one cut to the next. Pure
// arithmetic, so the cuts can be tested to the frame: they are rendered into files and cannot be corrected afterwards.
import type { SectionPlan } from "./chop";
import { MIN_TAIL_SECONDS } from "./chop";
import type { TapEstimate } from "./tapTempo";

export interface TapGrid {
  sampleRate: number;
  /** Frames from one line to the next. */
  beatFrames: number;
  /** The frame of line 0 (it may be fractional, and the song may start part way through it). */
  originFrame: number;
  /** Beats in a bar: the project's time signature numerator. */
  beatsPerBar: number;
  /** Lines moved by hand, by line number: how many frames from where the steady spacing puts them. */
  offsets: Readonly<Record<number, number>>;
}

/** The grid a tap estimate says: lines on the beats that were tapped. */
export function gridFromTaps(estimate: TapEstimate, sampleRate: number, beatsPerBar: number): TapGrid {
  return { sampleRate, beatFrames: estimate.period * sampleRate, originFrame: estimate.origin * sampleRate, beatsPerBar, offsets: {} };
}

/** The frame of line `n`: the steady spacing, plus whatever it was nudged by. */
export function lineFrame(grid: TapGrid, n: number): number {
  return grid.originFrame + n * grid.beatFrames + (grid.offsets[n] ?? 0);
}

/** The tempo the grid's spacing makes, in BPM: the project tempo the export writes. */
export function gridBpm(grid: TapGrid): number {
  return (60 * grid.sampleRate) / grid.beatFrames;
}

/** The number of the line nearest `frame` (by the steady spacing; a line nudged a little still belongs to the same number). */
export function nearestLine(grid: TapGrid, frame: number): number {
  return Math.round((frame - grid.originFrame) / grid.beatFrames);
}

/** The numbers of the lines that fall between two frames, nudged lines included. */
export function linesBetween(grid: TapGrid, from: number, to: number): number[] {
  // A nudge is a fraction of a beat at most in practice; looking a beat either side keeps a nudged line that has moved into view.
  const first = Math.floor((from - grid.originFrame) / grid.beatFrames) - 1;
  const last = Math.ceil((to - grid.originFrame) / grid.beatFrames) + 1;
  const lines: number[] = [];
  for (let n = first; n <= last; n++) {
    const frame = lineFrame(grid, n);
    if (frame >= from && frame <= to) lines.push(n);
  }
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
  return { ...grid, originFrame: grid.originFrame + frames };
}

/** The same grid on audio at another sample rate (the vocal stem need not be at the song's rate). */
export function scaleTapGrid(grid: TapGrid, sampleRate: number): TapGrid {
  const ratio = sampleRate / grid.sampleRate;
  const offsets: Record<number, number> = {};
  for (const [n, frames] of Object.entries(grid.offsets)) offsets[Number(n)] = frames * ratio;
  return { ...grid, sampleRate, beatFrames: grid.beatFrames * ratio, originFrame: grid.originFrame * ratio, offsets };
}

/** Whether line `n` is the first beat of a bar, counting from the line chosen as bar 1 (the first cut). With no bar 1 chosen yet no line is. */
export function isBarLine(grid: TapGrid, n: number, barOne: number | undefined): boolean {
  if (barOne === undefined) return false;
  const k = (n - barOne) % grid.beatsPerBar;
  return k === 0 || Math.abs(k) === grid.beatsPerBar;
}

/** The cuts with `n` taken out if it is one, put in if it is not: sorted, no repeats. */
export function toggleCut(cuts: readonly number[], n: number): number[] {
  return cuts.includes(n) ? cuts.filter((c) => c !== n) : [...cuts, n].sort((a, b) => a - b);
}

/** The cuts with `lines` added (a section dragged out is its first and last line). */
export function addCuts(cuts: readonly number[], lines: readonly number[]): number[] {
  return [...new Set([...cuts, ...lines])].sort((a, b) => a - b);
}

export interface TapSectionOptions {
  /** Also cut the rest of the song after the last cut (padded with silence to whole bars). Off: the last cut only ends the section before it. */
  restOfSong: boolean;
}

/**
 * The sections the cuts make, in the shape the export reads: each runs from one cut to the next, exactly (the frames are rounded from the lines'
 * own positions, so neighbouring sections share a frame and nothing is lost or doubled). `bars` is the section's length in whole bars, at least one,
 * for its pattern; a section that is not a whole number of bars is still cut where the lines are. The rest of the song after the last cut, if wanted,
 * is padded with silence to a whole number of bars, and left out if almost nothing of the song is in it.
 */
export function planTapSections(totalFrames: number, grid: TapGrid, cuts: readonly number[], options: TapSectionOptions): SectionPlan[] {
  const sections: SectionPlan[] = [];
  const barFrames = grid.beatFrames * grid.beatsPerBar;
  const minTail = Math.round(MIN_TAIL_SECONDS * grid.sampleRate);
  const add = (start: number, end: number, bars: number) => {
    const audioFrames = Math.max(0, Math.min(end, totalFrames) - Math.max(start, 0));
    sections.push({ start, length: end - start, bars, audioFrames, index: sections.length });
  };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const start = Math.round(lineFrame(grid, cuts[i]));
    const end = Math.round(lineFrame(grid, cuts[i + 1]));
    if (end <= start || end <= 0 || start >= totalFrames) continue;
    add(start, end, Math.max(1, Math.round((cuts[i + 1] - cuts[i]) / grid.beatsPerBar)));
  }
  if (options.restOfSong && cuts.length > 0) {
    const exact = lineFrame(grid, cuts[cuts.length - 1]);
    const start = Math.round(exact);
    if (start < totalFrames && totalFrames - Math.max(start, 0) >= minTail) {
      const bars = Math.max(1, Math.ceil((totalFrames - exact) / barFrames - 0.02));
      add(start, Math.round(exact + bars * barFrames), bars);
    }
  }
  return sections;
}

/** Sections that are not a whole number of bars (by their number, 1-based), for a warning: the export holds each for whole bars. */
export function oddSections(grid: TapGrid, cuts: readonly number[]): number[] {
  const odd: number[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) if ((cuts[i + 1] - cuts[i]) % grid.beatsPerBar !== 0) odd.push(i + 1);
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
