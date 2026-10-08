// The pattern maker's model: after chopper mode has cut a sample into chops, the user lays the chops out one after another (or leaves silence)
// to make the pattern. A slot is a chop played for some steps from its start (at most the whole chop), or a silence. A step is a sixteenth note, the finest
// the pattern maker works in. Everything here is plain
// arithmetic on steps so it can be tested; the screen (PatternMaker.tsx) only draws it and the export (exportChopper.ts) writes it.

/** A chop as the pattern maker knows it. */
export interface MakerChop {
  /** The slice of the chopper that plays it. */
  slice: number;
  /** First frame in the sample, and frames long. */
  start: number;
  length: number;
  /** Whole bars it is long (at least one). */
  bars: number;
  /** How long it is in steps (sixteenth notes): the longest a slot of it can be. */
  steps: number;
  /** The bar of the song's grid it started on (bar 1, the 1.1.1, is 0). */
  barIndex: number;
  /** Its place in the chop step's colours, and the colour (hex) that gave it in the scheme then in use. */
  colorIndex: number;
  color: string;
}

/** Steps (sixteenth notes) to a beat: the finest resolution of the chops and of the pattern maker. */
export const STEPS_PER_BEAT = 4;
/** Steps in a bar. */
export const stepsPerBar = (beatsPerBar: number): number => beatsPerBar * STEPS_PER_BEAT;

export type Slot = { kind: "chop"; chop: number; steps: number } | { kind: "silence"; steps: number };

/** The finest a chop or silence can be cut to, in steps (a sixteenth note). */
export const MIN_STEPS = 1;
/** The longest a silence can be: 16 bars. */
export const maxSilence = (beatsPerBar: number): number => 16 * stepsPerBar(beatsPerBar);
/** A silence starts as one bar. */
export const defaultSilence = (beatsPerBar: number): number => stepsPerBar(beatsPerBar);

/** The whole chop in steps: the longest a slot of it can be. */
export const chopSteps = (chop: MakerChop, _beatsPerBar?: number): number => chop.steps;

/** The longest a slot can be: the whole chop, or for silence the limit. */
export const slotMax = (chops: readonly MakerChop[], slot: Pick<Slot, "kind"> & { chop?: number }, beatsPerBar: number): number =>
  slot.kind === "chop" ? chopSteps(chops[slot.chop!], beatsPerBar) : maxSilence(beatsPerBar);

/** Where each slot starts, in steps, and the total after the last. */
export function slotStarts(slots: readonly Slot[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let at = 0;
  for (const s of slots) {
    starts.push(at);
    at += s.steps;
  }
  return { starts, total: at };
}

/**
 * The chops in the order the picker lists them from the bottom up, for a playhead at `playhead` steps: the chops that started on the same
 * bar of a four-bar phrase as the playhead is on come first (song order, beginning of the song at the bottom), then those two bars away, then the
 * bar after, then the bar before. So at bar 3 the list runs bar 3, bar 1, bar 4, bar 2 (counted in every phrase of the song). Returns indexes into `chops`.
 */
export function orderChops(chops: readonly MakerChop[], playhead: number, beatsPerBar: number): number[] {
  const bar = Math.floor(playhead / stepsPerBar(beatsPerBar));
  const rankOf = (c: MakerChop) => [0, 2, 1, 3][(((c.barIndex - bar) % 4) + 4) % 4];
  return chops
    .map((c, i) => ({ i, rank: rankOf(c) }))
    .sort((a, b) => a.rank - b.rank || chops[a.i].start - chops[b.i].start || a.i - b.i)
    .map((e) => e.i);
}

/**
 * Drags a slot's length: `wanted` is where the finger put it (it can be zero or below). From 1 step up to `max` the slot takes it. Below that the
 * slot is left at 0 and the overshoot cuts the slot before it short (`trim` steps, which the caller limits to leave it at least one).
 */
export function dragLength(wanted: number, max: number): { steps: number; trim: number } {
  if (wanted >= MIN_STEPS) return { steps: Math.min(max, wanted), trim: 0 };
  return { steps: 0, trim: Math.max(0, MIN_STEPS - wanted) };
}

/** `slots` with slot `at` set (or added at the end when `at` is past the last), and the slot before it cut by `trim` (never under one step). */
export function setSlot(slots: readonly Slot[], at: number, slot: Slot, trim = 0): Slot[] {
  const out = slots.slice();
  out[at] = slot;
  if (trim > 0 && at > 0) {
    const before = out[at - 1];
    out[at - 1] = { ...before, steps: Math.max(MIN_STEPS, before.steps - trim) };
  }
  return out;
}

export interface MakerNote {
  slice: number;
  /** Steps from the start of the pattern, and how many it is held. */
  start: number;
  steps: number;
}

/** The notes the slots make: one per chop slot, silences leave gaps. Slots that are not chops are skipped. */
export function slotNotes(slots: readonly Slot[], chops: readonly MakerChop[]): MakerNote[] {
  const { starts } = slotStarts(slots);
  const notes: MakerNote[] = [];
  slots.forEach((s, i) => {
    if (s.kind === "chop" && s.steps > 0) notes.push({ slice: chops[s.chop].slice, start: starts[i], steps: s.steps });
  });
  return notes;
}

/** Whether every chop slot plays its whole chop and nothing follows a short slot with a gap: then the chopper's own one-shot already does the cutting. */
export function needsGate(slots: readonly Slot[], chops: readonly MakerChop[], beatsPerBar: number): boolean {
  return slots.some((s) => s.kind === "silence" || s.steps < chopSteps(chops[s.chop], beatsPerBar));
}

/** Bars the pattern holds: the slots' length rounded up to whole bars, at least one. */
export const patternBars = (slots: readonly Slot[], beatsPerBar: number): number => Math.max(1, Math.ceil(slotStarts(slots).total / stepsPerBar(beatsPerBar)));

/** "bar.beat" of a position in steps, counted from 1.1 like the 1.1.1 of the grid; a position between beats says 1 e & a for the sixteenths of the beat (3.2e, 3.2&, 3.2a). */
export function positionText(steps: number, beatsPerBar: number): string {
  const bar = Math.floor(steps / stepsPerBar(beatsPerBar));
  const inBar = steps - bar * stepsPerBar(beatsPerBar);
  const beat = Math.floor(inBar / STEPS_PER_BEAT);
  return `${bar + 1}.${beat + 1}${["", "e", "&", "a"][inBar % STEPS_PER_BEAT]}`;
}

/**
 * The sequence as audio, for listening to it: each chop slot is the chop's first `steps` steps (never past the chop's own end) at its place,
 * silence is silence. `beatFrames` is the sample's frames to a beat at its own tempo. Returns one array per channel, as long as the sequence.
 */
export function renderSequence(channelData: readonly Float32Array[], chops: readonly MakerChop[], slots: readonly Slot[], beatFrames: number): Float32Array[] {
  const step = beatFrames / STEPS_PER_BEAT;
  const { starts, total } = slotStarts(slots);
  const out = channelData.map(() => new Float32Array(Math.max(1, Math.round(total * step))));
  slots.forEach((slot, i) => {
    if (slot.kind !== "chop") return;
    const chop = chops[slot.chop];
    const at = Math.round(starts[i] * step);
    const frames = Math.min(Math.round(slot.steps * step), chop.length);
    channelData.forEach((data, c) => {
      const from = Math.max(0, chop.start);
      const part = data.subarray(from, Math.min(data.length, from + frames));
      out[c].set(part.subarray(0, Math.max(0, Math.min(part.length, out[c].length - at))), at);
    });
  });
  return out;
}
