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
}

/** A section is this many bars long. */
export const SECTION_BARS = 8;
/** A final section holding less audio than this is not worth a pad: it would be silence and a stray tail. */
export const MIN_TAIL_SECONDS = 0.25;

export interface SectionPlan {
  /** First frame of the section in the song. Negative when the downbeat sits before the start of the file. */
  start: number;
  /** Frames in the section: a whole 8 bars (the grid is fractional, so lengths differ by at most one frame). */
  length: number;
  /** Frames of real audio at the end of the song that fit in it; less than `length` for the last, padded, section. */
  audioFrames: number;
  /** Which section of the grid this is (0-based), the key into `SongGrid.shifts`. */
  index: number;
}

/** Frames in one bar, exact (not rounded). */
export function framesPerBar(grid: SongGrid): number {
  return (grid.beatsPerBar * 60 * grid.sampleRate) / grid.bpm;
}

/** Where the grid puts the start of section `k` (0-based), rounded to a frame, before any hand-made shift. */
export function gridStart(grid: SongGrid, k: number): number {
  return Math.round(grid.downbeatFrame + k * framesPerBar(grid) * SECTION_BARS);
}

/**
 * The 8-bar sections of a song, in order. Every cut is rounded from its exact grid position, never from the previous
 * cut, so rounding never builds up and, with no hand-made shifts, the sections tile the song with no gap and no overlap.
 */
export function planSections(totalFrames: number, grid: SongGrid): SectionPlan[] {
  const section = framesPerBar(grid) * SECTION_BARS;
  if (!(section > 0) || !Number.isFinite(section)) return [];
  const minTail = Math.round(MIN_TAIL_SECONDS * grid.sampleRate);
  const sections: SectionPlan[] = [];
  // The first section is the one holding frame 0: with the downbeat before the file starts, earlier sections would be silence.
  for (let k = Math.max(0, Math.ceil(-(grid.downbeatFrame + section) / section)); ; k++) {
    const length = gridStart(grid, k + 1) - gridStart(grid, k);
    const start = gridStart(grid, k) + (grid.shifts?.[k] ?? 0);
    const end = start + length;
    const audioFrames = Math.max(0, Math.min(end, totalFrames) - Math.max(start, 0));
    if (start >= totalFrames) break;
    if (end <= 0) continue;
    // Only the last section can run past the audio; it is kept if enough of the song is in it.
    if (end > totalFrames && audioFrames < minTail) break;
    sections.push({ start, length, audioFrames, index: k });
  }
  return sections;
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
