// Cuts a song into sections of whole bars on an exact sample grid. The planning is pure arithmetic so it can be tested to the frame:
// the cuts are rendered into files and trimmed in Koala, so a small mistake here cannot be fixed afterwards.

/** Where the song's bars fall. */
export interface SongGrid {
  bpm: number;
  /** Beats in a bar: the project's time signature numerator (4 for 4/4, 3 for 3/4, 7 for 7/4). */
  beatsPerBar: number;
  /** The frame of bar 1 beat 1. May be fractional, and may be negative or past the start of the file. */
  downbeatFrame: number;
  sampleRate: number;
  /**
   * Frames a cut has been moved by hand from where the grid puts it, by section (0-based). The section still lasts exactly 8 bars,
   * so a moved cut leaves a gap or an overlap with its neighbours: it is for a song that drifts off its tempo.
   */
  shifts?: Readonly<Record<number, number>>;
  /**
   * Bars in a section, by section (0-based), where it is not the usual 8: a song that drops or adds bars before a chorus has a
   * short section there. Every later section starts that much sooner (or later) with it.
   */
  bars?: Readonly<Record<number, number>>;
}

/** A section is this many bars long. */
export const SECTION_BARS = 8;
/** A final section holding less audio than this is not worth a pad: it would be silence and a stray tail. */
export const MIN_TAIL_SECONDS = 0.25;

export interface SectionPlan {
  /** First frame of the section in the song. Negative when the downbeat sits before the start of the file. */
  start: number;
  /** Frames in the section: a whole number of bars, 8 unless the song's structure says otherwise (the grid is fractional, so lengths differ by at most one frame). */
  length: number;
  /** Bars in the section: its pattern is this long. */
  bars: number;
  /** Frames of real audio at the end of the song that fit in it; less than `length` for the last, padded, section. */
  audioFrames: number;
  /** Which section of the grid this is (0-based), the key into `SongGrid.shifts`. */
  index: number;
}

/** Frames in one bar, exact (not rounded). */
export function framesPerBar(grid: SongGrid): number {
  return (grid.beatsPerBar * 60 * grid.sampleRate) / grid.bpm;
}

/** Bars in section `k` (0-based). */
export function barsOf(grid: SongGrid, k: number): number {
  return grid.bars?.[k] ?? SECTION_BARS;
}

/** Bars between bar 1 and the start of section `k`. */
export function barsBefore(grid: SongGrid, k: number): number {
  let bars = 0;
  for (let j = 0; j < k; j++) bars += barsOf(grid, j);
  return bars;
}

/** Where the grid puts the start of section `k` (0-based), rounded to a frame, before any hand-made shift. */
export function gridStart(grid: SongGrid, k: number): number {
  return Math.round(grid.downbeatFrame + barsBefore(grid, k) * framesPerBar(grid));
}

/**
 * The sections of a song, in order: 8 bars each unless the song's structure says a section is shorter or longer. Every cut is
 * rounded from its exact grid position, never from the previous cut, so rounding never builds up and, with no hand-made shifts,
 * the sections tile the song with no gap and no overlap.
 */
export function planSections(totalFrames: number, grid: SongGrid): SectionPlan[] {
  const bar = framesPerBar(grid);
  if (!(bar > 0) || !Number.isFinite(bar)) return [];
  const minTail = Math.round(MIN_TAIL_SECONDS * grid.sampleRate);
  const sections: SectionPlan[] = [];
  let before = 0;
  for (let k = 0; k < 100000; k++) {
    const bars = barsOf(grid, k);
    const gridFrom = Math.round(grid.downbeatFrame + before * bar);
    const length = Math.round(grid.downbeatFrame + (before + bars) * bar) - gridFrom;
    before += bars;
    const start = gridFrom + (grid.shifts?.[k] ?? 0);
    const end = start + length;
    const audioFrames = Math.max(0, Math.min(end, totalFrames) - Math.max(start, 0));
    if (start >= totalFrames) break;
    // Sections that end before the song starts (a downbeat before the file) would be silence.
    if (end <= 0) continue;
    // Only the last section can run past the audio; it is kept if enough of the song is in it.
    if (end > totalFrames && audioFrames < minTail) break;
    sections.push({ start, length, bars, audioFrames, index: k });
  }
  return sections;
}

/** How close to a whole number of bars a moved cut has to land to count as a change in the song's structure, in bars. */
export const STRUCTURE_TOLERANCE_BARS = 0.08;
/** The most bars a cut can be out by and still be taken as a structure change (half a section less one bar), and the longest a section can be. */
export const MAX_STRUCTURE_BARS = 7;
export const MAX_SECTION_BARS = 16;

export interface CutEdit {
  shifts: Record<number, number>;
  bars: Record<number, number>;
  /** Bars the previous section gained (negative: lost) because the cut landed a whole number of bars from the grid; 0 for a plain move. */
  barChange: number;
}

/**
 * Settles a cut dragged to `frame`. A cut of a steady song lands within a few milliseconds of the grid and is kept as a small shift. One that lands
 * almost exactly one to seven bars from where the grid has it means the song's structure differs there (a bar missing before a chorus, say): the
 * section before it is that many bars shorter (longer, if later), every later cut moves with it, and what is left over is a small shift.
 */
export function settleCut(grid: SongGrid, k: number, frame: number): CutEdit {
  const shifts = { ...grid.shifts };
  const bars = { ...grid.bars };
  const bar = framesPerBar(grid);
  const away = (frame - gridStart(grid, k)) / bar;
  const whole = Math.round(away);
  const previous = barsOf(grid, k - 1);
  if (k >= 1 && whole !== 0 && Math.abs(away - whole) <= STRUCTURE_TOLERANCE_BARS && Math.abs(whole) <= MAX_STRUCTURE_BARS && previous + whole >= 1 && previous + whole <= MAX_SECTION_BARS) {
    bars[k - 1] = previous + whole;
    if (bars[k - 1] === SECTION_BARS) delete bars[k - 1];
    const moved = { ...grid, bars };
    shifts[k] = frame - gridStart(moved, k);
    return { shifts, bars, barChange: whole };
  }
  shifts[k] = frame - gridStart(grid, k);
  return { shifts, bars, barChange: 0 };
}

/** One section's audio, zero-padded where the section runs outside the song, so it is always exactly `plan.length` frames. */
export function sliceSection(channelData: Float32Array[], plan: SectionPlan): Float32Array[] {
  return channelData.map((data) => {
    const out = new Float32Array(plan.length);
    const from = Math.max(0, plan.start);
    const to = Math.min(data.length, plan.start + plan.length);
    if (to > from) out.set(data.subarray(from, to), from - plan.start);
    return out;
  });
}

/** Seconds in one 8-bar section, for showing the user. */
export function sectionSeconds(bpm: number, beatsPerBar: number): number {
  return (SECTION_BARS * beatsPerBar * 60) / bpm;
}
