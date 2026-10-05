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
}

/** Frames in one bar, exact (not rounded). */
export function framesPerBar(grid: SongGrid): number {
  return (grid.beatsPerBar * 60 * grid.sampleRate) / grid.bpm;
}

/**
 * The 8-bar sections of a song, in order. Every cut is rounded from its exact grid position, never from the previous
 * cut, so rounding never builds up and the sections tile the song with no gap and no overlap.
 */
export function planSections(totalFrames: number, grid: SongGrid): SectionPlan[] {
  const section = framesPerBar(grid) * SECTION_BARS;
  if (!(section > 0) || !Number.isFinite(section)) return [];
  const minTail = Math.round(MIN_TAIL_SECONDS * grid.sampleRate);
  const sections: SectionPlan[] = [];
  // The first section is the one holding frame 0: with the downbeat before the file starts, earlier sections would be silence.
  for (let k = Math.max(0, Math.ceil(-(grid.downbeatFrame + section) / section)); ; k++) {
    const start = Math.round(grid.downbeatFrame + k * section);
    const end = Math.round(grid.downbeatFrame + (k + 1) * section);
    const audioFrames = Math.max(0, Math.min(end, totalFrames) - Math.max(start, 0));
    if (start >= totalFrames) break;
    if (end <= 0) continue;
    // Only the last section can run past the audio; it is kept if enough of the song is in it.
    if (end > totalFrames && audioFrames < minTail) break;
    sections.push({ start, length: end - start, audioFrames });
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
