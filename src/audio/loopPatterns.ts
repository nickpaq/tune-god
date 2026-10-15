// Loops with a tempo in their file name get a stretch length in bars, and each melodic loop also gets a pattern of its own: one note on its pad, held for
// the loop's whole length. Where the patterns go (Koala has 32 pattern slots, four banks of 8):
//   - Slots 1 to 16 (the first two banks) are never touched by a loop pattern.
//   - Loop patterns fill slots 17 to 32 from the LAST slot back towards the middle (32, 31, 30...).
//   - Chops (acapella, synced and chopper mode) fill from the FIRST slot forward and may run on into slots 17 to 32, where they overwrite loop patterns.
//     A slot holding a loop pattern therefore counts as free to a chop (`isLoopPattern`), and the loop patterns are written after the chops into whatever
//     is still empty, so a chop always wins a slot.
import { emptySequence, isEmpty, isLoopPattern, SEQUENCE_SLOTS, TICKS_PER_BEAT } from "./exportSong";

/** The bar lengths a loop is rounded to. */
export const LOOP_BARS = [2, 4, 8, 16] as const;
/** The first slot (0-based) a loop pattern may use: slots 0 to 15 are the first two banks of 8 and are never used. */
export const FIRST_LOOP_PATTERN_SLOT = 16;
/** The note every loop pattern holds: pitch 0 is the pad's own pitch (C3) and the velocity is 100. */
export const LOOP_NOTE_VELOCITY = 100;

/**
 * How many bars a loop is, from its length and the tempo in its file name, rounded to the nearest of 2, 4, 8 and 16 (nearest in ratio, so 6 bars is
 * closer to 8 than to 4 and 1 bar is 2; never more than 16). Null when the length or tempo is unusable.
 */
export function estimateLoopBars(seconds: number, bpm: number, beatsPerBar = 4): number | null {
  if (!(seconds > 0) || !(bpm > 0) || !(beatsPerBar > 0) || !Number.isFinite(seconds) || !Number.isFinite(bpm)) return null;
  const raw = (seconds * bpm) / 60 / beatsPerBar;
  let best: number = LOOP_BARS[0];
  for (const bars of LOOP_BARS) if (Math.abs(Math.log2(raw / bars)) < Math.abs(Math.log2(raw / best))) best = bars;
  return best;
}

/** One loop pattern: a single note on the pad at 1.1.1, as long as the pattern. */
function loopPattern(pad: number, bars: number, beatsPerBar: number) {
  return {
    ...emptySequence(),
    tunegodLoopPattern: pad,
    noteSequence: {
      pattern: {
        numBars: bars,
        notes: [
          {
            chance: 1.0,
            length: Math.round(bars * beatsPerBar * TICKS_PER_BEAT),
            num: pad,
            pan: -1.0078740119934082,
            pitch: 0.0,
            start: 0.0,
            subPad: -1,
            timeOffset: 0,
            vel: LOOP_NOTE_VELOCITY,
          },
        ],
      },
    },
  };
}

/**
 * Writes one pattern per melodic loop (`entries`, taken in the order given: the first loop gets the last slot), from the last slot back towards slot 17,
 * into slots that are empty. Patterns of this kind from an earlier export are cleared first, so a re-export never leaves stale ones. Returns how many
 * were written (loops past the available slots get none).
 */
export function writeLoopPatterns(sequences: any[], entries: { pad: number; bars: number }[], beatsPerBar: number): number {
  while (sequences.length < SEQUENCE_SLOTS) sequences.push(emptySequence());
  for (let i = 0; i < sequences.length; i++) if (isLoopPattern(sequences[i])) sequences[i] = emptySequence();
  let slot = SEQUENCE_SLOTS - 1;
  let written = 0;
  for (const entry of entries) {
    while (slot >= FIRST_LOOP_PATTERN_SLOT && !isEmpty(sequences[slot])) slot--;
    if (slot < FIRST_LOOP_PATTERN_SLOT) break;
    sequences[slot] = loopPattern(entry.pad, entry.bars, beatsPerBar);
    slot--;
    written++;
  }
  return written;
}
