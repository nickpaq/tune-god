// The sections of a chopped song as pads. Like ghost and placeholder pads they have no slot in the project they were loaded
// from: they are written into the export as new pads (see exportSong.ts), so they are not "real" pads and are left out of tuning and mixing.
import type { Pad } from "../components/PadPanel";
import { sliceSection, type SectionPlan } from "./song/chop";

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

/**
 * The section pads, placed on the free slots: `song` is the sound that is cut (the vocal stem, for the a cappella chop) and `plans` say where, at
 * that sound's own sample rate (see `scalePlans`). `bpm` is the tempo of the tapped grid. `title` is what the song is called, for the labels.
 */
export function makeSectionPads(song: Pad, plans: SectionPlan[], bpm: number, beatsPerBar: number, free: number[], title?: string): SongChopResult {
  const pads: Pad[] = [];
  plans.slice(0, free.length).forEach((plan, n) => {
    pads.push({
      index: free[n],
      origIndex: SECTION_ORIG_BASE + n,
      name: `${song.name} section ${n + 1}`,
      sampleId: 0,
      sampleRate: song.sampleRate,
      channelData: sliceSection(song.channelData, plan),
      // The sections are vocals, so they are classified as such: the vocal colour and symbol, and (with the Mix switch) the vocal bus.
      category: "vox",
      tune: false,
      semis: 0,
      cents: 0,
      section: { number: n + 1, sourceSampleId: song.sampleId, bpm, beatsPerBar, bars: plan.bars, title },
    });
  });
  return { pads, dropped: Math.max(0, plans.length - free.length), seconds: plans.slice(0, free.length).reduce((sum, p) => sum + p.length, 0) / song.sampleRate };
}
