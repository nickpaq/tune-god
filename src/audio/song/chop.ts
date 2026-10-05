// Cuts a song into sections of whole bars on an exact sample grid. The planning is pure arithmetic so it can be tested to the frame:
// the cuts are rendered into files and trimmed in Koala, so a small mistake here cannot be fixed afterwards.

/** Where the song's bars fall. */
export interface SongGrid {
  /** The tempo the grid starts from (detected or typed): it sets the bar length until two cuts have been placed by hand. */
  bpm: number;
  /** Beats in a bar: the project's time signature numerator (4 for 4/4, 3 for 3/4, 7 for 7/4). */
  beatsPerBar: number;
  /** The frame of bar 1 beat 1, the first cut. May be fractional, and may be negative or past the start of the file. */
  downbeatFrame: number;
  sampleRate: number;
  /**
   * Cuts placed by hand, by section (0-based, so 1 and up), as the frame they were put on. Every one refines the grid: the cuts between two of them
   * are spread evenly, and the cuts after the last one follow the tempo fitted through all of them, starting from that one (see `framesPerBarOf`).
   */
  anchors?: Readonly<Record<number, number>>;
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
  /** Frames in the section: a whole number of bars at the song's tempo, 8 bars unless the song's structure says otherwise. */
  length: number;
  /** Bars in the section: its pattern is this long. */
  bars: number;
  /** Frames of real audio at the end of the song that fit in it; less than `length` for the last, padded, section. */
  audioFrames: number;
  /** Which section of the grid this is (0-based), the key into `SongGrid.anchors` and `bars`. */
  index: number;
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

/** The bar length the grid starts from, from its base tempo (exact, not rounded). */
function baseFramesPerBar(grid: SongGrid): number {
  return (grid.beatsPerBar * 60 * grid.sampleRate) / grid.bpm;
}

interface Anchor {
  k: number;
  /** Bars from bar 1 to this cut. */
  bars: number;
  frame: number;
}

/** The first cut and every cut placed by hand, in order of section. */
function anchorList(grid: SongGrid): Anchor[] {
  const list: Anchor[] = [{ k: 0, bars: 0, frame: grid.downbeatFrame }];
  for (const key of Object.keys(grid.anchors ?? {})
    .map(Number)
    .filter((k) => k >= 1)
    .sort((a, b) => a - b)) {
    list.push({ k: key, bars: barsBefore(grid, key), frame: (grid.anchors as Record<number, number>)[key] });
  }
  return list;
}

/** Frames in a bar, fitted: the least-squares line through every cut that has been placed, or the base tempo's while there are fewer than two. */
function fittedFramesPerBar(list: Anchor[], base: number): number {
  if (list.length < 2) return base;
  const n = list.length;
  const meanBars = list.reduce((s, a) => s + a.bars, 0) / n;
  const meanFrame = list.reduce((s, a) => s + a.frame, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const a of list) {
    covariance += (a.bars - meanBars) * (a.frame - meanFrame);
    variance += (a.bars - meanBars) ** 2;
  }
  const slope = variance > 0 ? covariance / variance : base;
  return slope > 0 && Number.isFinite(slope) ? slope : base;
}

/** Frames in one bar, exact (not rounded): what the cuts placed by hand say the tempo is, or the base tempo's until there are two. */
export function framesPerBarOf(grid: SongGrid): number {
  return fittedFramesPerBar(anchorList(grid), baseFramesPerBar(grid));
}

/** The song's tempo as the grid has it now, in BPM: the project tempo the export writes. */
export function effectiveBpm(grid: SongGrid): number {
  return (grid.beatsPerBar * 60 * grid.sampleRate) / framesPerBarOf(grid);
}

/** Positions of the cuts, worked out once for a grid. */
function positions(grid: SongGrid) {
  const list = anchorList(grid);
  const bar = fittedFramesPerBar(list, baseFramesPerBar(grid));
  const byK = new Map(list.map((a) => [a.k, a]));
  const cumulative: number[] = [0];
  const bars = (k: number) => {
    while (cumulative.length <= k) cumulative.push(cumulative[cumulative.length - 1] + barsOf(grid, cumulative.length - 1));
    return cumulative[k];
  };
  /** Where the grid puts a point `at` bars from bar 1, exact: between the cuts placed around it, or on from the last one at the fitted tempo. */
  const frameAtBars = (at: number): number => {
    let before = list[0];
    let after: Anchor | undefined;
    for (const a of list) {
      if (a.bars < at) before = a;
      else if (a.bars > at) {
        after = a;
        break;
      } else return a.frame;
    }
    if (after) return before.frame + ((after.frame - before.frame) * (at - before.bars)) / (after.bars - before.bars);
    return before.frame + bar * (at - before.bars);
  };
  /** Where section `k` starts, exact: where it was put, or worked out from the cuts placed around it. */
  const frame = (k: number): number => byK.get(k)?.frame ?? frameAtBars(bars(k));
  return { frame, frameAtBars, bar };
}

/** Where section `k` (0-based) starts, to a fraction of a frame: where it was put by hand, or where the grid puts it. */
export function cutFrame(grid: SongGrid, k: number): number {
  return positions(grid).frame(k);
}

/**
 * The sections of a song, in order: 8 bars each unless the song's structure says a section is shorter or longer. A cut starts where it was put
 * by hand or where the grid, refined by every cut that has been put, says. A section lasts exactly its bars at the song's tempo, so a section
 * can overlap, or leave a gap before, the next by the few milliseconds the song's own tempo drifts.
 */
export function planSections(totalFrames: number, grid: SongGrid): SectionPlan[] {
  const { frame, bar } = positions(grid);
  if (!(bar > 0) || !Number.isFinite(bar)) return [];
  const minTail = Math.round(MIN_TAIL_SECONDS * grid.sampleRate);
  const sections: SectionPlan[] = [];
  for (let k = 0; k < 100000; k++) {
    const bars = barsOf(grid, k);
    const exact = frame(k);
    const start = Math.round(exact);
    // Rounded from the exact start and end, so with no cuts moved by hand the sections tile the song with no gap and no overlap.
    const length = Math.round(exact + bars * bar) - start;
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
  anchors: Record<number, number>;
  bars: Record<number, number>;
  /** Bars the previous section gained (negative: lost) because the cut landed a whole number of bars from the grid; 0 for a plain move. */
  barChange: number;
}

/** The grid without the hand-placed cut at `k`: where the other cuts say it should be. */
export function withoutAnchor(grid: SongGrid, k: number): SongGrid {
  const anchors = { ...grid.anchors };
  delete anchors[k];
  return { ...grid, anchors };
}

/**
 * Settles a cut put on `frame`. It becomes an anchor: the grid is refined by it, so the cuts after it follow from here. A cut that lands almost exactly
 * one to seven bars from where the grid had it means the song's structure differs there (a bar missing before a chorus, say): the section before it is
 * that many bars shorter (longer, if later), and the cuts after it follow.
 */
export function settleCut(grid: SongGrid, k: number, frame: number): CutEdit {
  const anchors = { ...grid.anchors, [k]: frame };
  const bars = { ...grid.bars };
  const others = withoutAnchor(grid, k);
  const { frame: predicted, bar } = positions(others);
  const away = (frame - predicted(k)) / bar;
  const whole = Math.round(away);
  const previous = barsOf(grid, k - 1);
  if (k >= 1 && whole !== 0 && Math.abs(away - whole) <= STRUCTURE_TOLERANCE_BARS && Math.abs(whole) <= MAX_STRUCTURE_BARS && previous + whole >= 1 && previous + whole <= MAX_SECTION_BARS) {
    bars[k - 1] = previous + whole;
    if (bars[k - 1] === SECTION_BARS) delete bars[k - 1];
    return { anchors, bars, barChange: whole };
  }
  return { anchors, bars, barChange: 0 };
}

export interface Snap {
  /** The frame of the bar line the cut snapped to. */
  frame: number;
  /** Bars the previous section gained (negative: lost) if the cut snapped to a different bar line than the one the grid had it on; 0 for the same one. */
  barChange: number;
}

/**
 * Where a cut dragged to `raw` snaps to: the nearest bar line of the grid as the other cuts have refined it. The bar lines are the cut's own place
 * and the places one to seven bars either side, which is a section of that many bars fewer or more before it: so snapping is how a section is made
 * 5 bars, say, without touching the tempo. Bar 1 does not snap: it is where the grid starts.
 */
export function snapCut(grid: SongGrid, k: number, raw: number): Snap {
  if (k < 1) return { frame: Math.round(raw), barChange: 0 };
  const others = withoutAnchor(grid, k);
  const { frameAtBars } = positions(others);
  const base = barsBefore(others, k);
  const previous = barsOf(others, k - 1);
  let best: Snap = { frame: frameAtBars(base), barChange: 0 };
  for (let j = -MAX_STRUCTURE_BARS; j <= MAX_STRUCTURE_BARS; j++) {
    if (j === 0 || previous + j < 1 || previous + j > MAX_SECTION_BARS) continue;
    const frame = frameAtBars(base + j);
    if (Math.abs(frame - raw) < Math.abs(best.frame - raw)) best = { frame, barChange: j };
  }
  return { frame: Math.round(best.frame), barChange: best.barChange };
}

/**
 * What snapping a cut does to the grid: the section before it gains or loses the bars it snapped across, and the cut stops being an anchor, because
 * it sits exactly on a bar line of the grid and says nothing new about the tempo. Only the structure changes.
 */
export function snapEdit(grid: SongGrid, k: number, raw: number): CutEdit {
  const { barChange } = snapCut(grid, k, raw);
  const anchors = { ...withoutAnchor(grid, k).anchors };
  const bars = { ...grid.bars };
  if (barChange !== 0) {
    bars[k - 1] = barsOf(grid, k - 1) + barChange;
    if (bars[k - 1] === SECTION_BARS) delete bars[k - 1];
  }
  return { anchors, bars, barChange };
}

/** The same grid on audio at another sample rate (the vocal stem need not be at the song's rate): every frame position scales with it. */
export function scaleGrid(grid: SongGrid, sampleRate: number): SongGrid {
  const ratio = sampleRate / grid.sampleRate;
  const anchors: Record<number, number> = {};
  for (const [k, frame] of Object.entries(grid.anchors ?? {})) anchors[Number(k)] = frame * ratio;
  return { ...grid, sampleRate, downbeatFrame: grid.downbeatFrame * ratio, anchors };
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
