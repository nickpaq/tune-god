// The sections of a chopped song as pads. Like ghost and placeholder pads they have no slot in the project they were loaded
// from: they are written into the export as new pads (see exportSong.ts), so they are not "real" pads and are left out of tuning and mixing.
import type { Pad } from "../components/PadPanel";
import { CHOP_BANK_START, PAD_COUNT } from "./padMoves";
import { sliceSection, type SectionPlan } from "./song/chop";

/** Section pads have no project slot, so their stable id sits above the placeholders' and ghosts'. */
const SECTION_ORIG_BASE = 3000;

/**
 * The pad slots sections can go on: bank D, the acapella's bank, and nowhere else. A slot is free when nothing is on it or only a
 * blank "Empty pad" placeholder.
 */
export function freeSongSlots(pads: Record<number, Pad>): number[] {
  const slots: number[] = [];
  for (let i = CHOP_BANK_START; i < PAD_COUNT; i++) {
    const pad = pads[i];
    if (!pad || pad.placeholder?.kind === "empty") slots.push(i);
  }
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
 * that sound's own sample rate (see `scalePlans`). `bpm` is the tempo of the tapped grid. `colors` is the palette the sections were coloured from in the chop editor: each section keeps its colour as hex.
 */
export function makeSectionPads(song: Pad, plans: SectionPlan[], bpm: number, beatsPerBar: number, free: number[], colors?: string[]): SongChopResult {
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
      section: { number: n + 1, sourceSampleId: song.sampleId, bpm, beatsPerBar, bars: plan.bars, colorIndex: plan.colorIndex, color: colors && plan.colorIndex !== undefined ? colors[plan.colorIndex % colors.length] : undefined },
    });
  });
  return { pads, dropped: Math.max(0, plans.length - free.length), seconds: plans.slice(0, free.length).reduce((sum, p) => sum + p.length, 0) / song.sampleRate };
}
