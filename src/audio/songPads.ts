// The 8-bar sections of a chopped song as pads. Like ghost and placeholder pads they have no slot in the project they were loaded
// from: they are written into the export as new pads (see exportSong.ts), so they are not "real" pads and are left out of tuning and mixing.
import type { Pad } from "../components/PadPanel";
import { planSections, sliceSection, SECTION_BARS, type SongGrid } from "./song/chop";

/** Section pads have no project slot, so their stable id sits above the placeholders' and ghosts'. */
const SECTION_ORIG_BASE = 3000;

/** The empty pad slots sections can go on: the fourth bank first, then the others from the back. */
export function freeSongSlots(pads: Record<number, Pad>): number[] {
  const slots: number[] = [];
  for (let bank = 3; bank >= 0; bank--) for (let i = 0; i < 16; i++) if (!pads[bank * 16 + i]) slots.push(bank * 16 + i);
  return slots;
}

export interface SongChopResult {
  pads: Pad[];
  /** Sections that did not fit on a free pad and were left out. */
  dropped: number;
  seconds: number;
}

/** The section pads for a song, placed on the free slots. */
export function makeSectionPads(song: Pad, grid: SongGrid, free: number[]): SongChopResult {
  const plans = planSections(song.channelData[0].length, grid);
  const pads: Pad[] = [];
  plans.slice(0, free.length).forEach((plan, n) => {
    pads.push({
      index: free[n],
      origIndex: SECTION_ORIG_BASE + n,
      name: `${song.name} section ${n + 1}`,
      sampleId: 0,
      sampleRate: song.sampleRate,
      channelData: sliceSection(song.channelData, plan),
      category: "other",
      tune: false,
      semis: 0,
      cents: 0,
      section: { number: n + 1, sourceSampleId: song.sampleId, bpm: grid.bpm, beatsPerBar: grid.beatsPerBar },
    });
  });
  return { pads, dropped: Math.max(0, plans.length - free.length), seconds: (SECTION_BARS * grid.beatsPerBar * 60) / grid.bpm };
}
