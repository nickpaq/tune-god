// What a chopped song is cut into: sections on an exact sample grid. Where the cuts fall comes from the tapped grid (tapGrid.ts); the plan is plain
// arithmetic so it can be tested to the frame: the cuts are rendered into files and trimmed in Koala, so a small mistake cannot be fixed afterwards.

export interface SectionPlan {
  /** First frame of the section in the song. Negative when the cut sits before the start of the file. */
  start: number;
  /** Frames in the section: from its cut to the next one (the rest of the song, padded to whole bars, for the last). */
  length: number;
  /** Whole bars the section holds, at least one: its pattern is this long. */
  bars: number;
  /** Frames of real audio that fit in it; less than `length` for a section that runs past the end of the song. */
  audioFrames: number;
  /** Which section this is (0-based). */
  index: number;
}

/** A final section holding less audio than this is not worth a pad: it would be silence and a stray tail. */
export const MIN_TAIL_SECONDS = 0.25;

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
