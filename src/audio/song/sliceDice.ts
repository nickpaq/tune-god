// The model of Slice and dice, the chopper's pattern maker. The song is cut into equal pieces of one chosen size (an eighth note to a bar), measured
// from the first step (the beginning of the song, or the anchor). The arrangement is a row of slots, each a piece of the song or a silence. Positions
// are steps (sixteenth notes, fractional for triplets); sample boundaries are frames taken from the grid. Everything here is plain arithmetic so it can be tested.
import { fineLineNear, lineFrame, type TapGrid } from "./tapGrid";
import { noteLength } from "./noteLengths";
import { slotStarts, stepsPerBar, type MakerChop, type Slot } from "./patternMaker";

export interface DiceState {
  chops: MakerChop[];
  slots: Slot[];
}

export const mod = (n: number, span: number) => ((n % span) + span) % span;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Grid positions are whole twelfths of a step (a triplet 64th). */
const snap = (steps: number) => Math.round(steps * 12) / 12;
const EPS = 1e-6;

/** The sizes of the grid the knob picks from, in the order the user asked for them. */
export const SIZES = [
  { id: "8", label: "1/8", value: "8" as const, triplet: false },
  { id: "8T", label: "1/8T", value: "8" as const, triplet: true },
  { id: "4", label: "1/4", value: "4" as const, triplet: false },
  { id: "4T", label: "1/4T", value: "4" as const, triplet: true },
  { id: "2", label: "1/2", value: "2" as const, triplet: false },
  { id: "2T", label: "1/2T", value: "2" as const, triplet: true },
  { id: "bar", label: "1 bar", value: "bar" as const, triplet: false },
];
export const DEFAULT_SIZE = 2;

/** Length in steps of a size choice. */
export const sizeSteps = (index: number, beatsPerBar: number): number => {
  const s = SIZES[clamp(Math.round(index), 0, SIZES.length - 1)];
  return noteLength(s.value === "8" ? "8" : s.value, s.triplet, beatsPerBar);
};

/** The song's end in steps: pieces must end at or before it. */
export const songSteps = (grid: TapGrid, totalFrames: number): number => Math.floor(fineLineNear(grid, totalFrames, 48) * 4 + EPS);

/** The first step whose frame is inside the song: where the beginning of the song, with no anchor placed, is on the grid. */
export const firstStep = (grid: TapGrid): number => Math.ceil(fineLineNear(grid, 0, 48) * 4 - EPS) + 0;

/** Where the piece of `steps` steps that starts on `sourceStep` is in the song, or null when it does not fit inside it. */
export function makePiece(
  grid: TapGrid,
  totalFrames: number,
  colors: readonly string[],
  sourceStep: number,
  steps: number,
  slice = 0,
): MakerChop | null {
  const start = Math.round(lineFrame(grid, sourceStep / 4));
  const end = Math.round(lineFrame(grid, (sourceStep + steps) / 4));
  if (steps <= 0 || start < 0 || end <= start || end > totalFrames) return null;
  const barIndex = Math.floor(sourceStep / stepsPerBar(grid.beatsPerBar));
  const colorIndex = mod(barIndex, 4);
  return { slice, start, length: end - start, steps, bars: steps / stepsPerBar(grid.beatsPerBar), barIndex, colorIndex, color: colors[colorIndex] };
}

/** The step of the song a chop slot plays from. */
export const sourceStepOf = (grid: TapGrid, state: DiceState, slot: Slot): number | null =>
  slot.kind === "chop" ? snap(fineLineNear(grid, state.chops[slot.chop].start, 48) * 4) : null;

/** `state` with a chop slot of `piece` (reusing the same piece when it is already in the list); `at` is where it goes (default the end). */
export function withPiece(state: DiceState, piece: MakerChop, at?: number, mode: "insert" | "replace" = "insert"): DiceState {
  let chop = state.chops.findIndex((c) => c.start === piece.start && c.length === piece.length && c.steps === piece.steps);
  const chops = state.chops.slice();
  if (chop < 0) {
    chop = chops.length;
    chops.push({ ...piece, slice: chop });
  }
  const slots = state.slots.slice();
  const slot: Slot = { kind: "chop", chop, steps: piece.steps };
  if (at === undefined || at >= slots.length) slots.push(slot);
  else slots.splice(at, mode === "replace" ? 1 : 0, slot);
  return { chops, slots };
}

/** The steps the pieces of `steps` can start on, ascending: from the first step of the song on, as far as the song goes. */
export function sourceSteps(grid: TapGrid, totalFrames: number, colors: readonly string[], origin: number, steps: number): number[] {
  const out: number[] = [];
  const end = songSteps(grid, totalFrames);
  for (let k = 0; ; k++) {
    const s = snap(origin + k * steps);
    if (s + steps > end + EPS) break;
    if (makePiece(grid, totalFrames, colors, s, steps)) out.push(s);
  }
  return out;
}

/** The piece that follows (+1) or precedes (-1) the one a slot plays, at the slot's own length, or null at the end of the song. */
export function neighbourPiece(grid: TapGrid, totalFrames: number, colors: readonly string[], state: DiceState, slot: Slot, direction: 1 | -1): MakerChop | null {
  const from = sourceStepOf(grid, state, slot);
  if (from === null) return null;
  return makePiece(grid, totalFrames, colors, snap(from + direction * slot.steps), slot.steps);
}

/** The slot before `at` that is a chop, searching backwards, or the last chop slot when `at` is past the end. */
const lastChopBefore = (slots: readonly Slot[], at: number): number => {
  for (let i = Math.min(at, slots.length - 1); i >= 0; i--) if (slots[i].kind === "chop") return i;
  return -1;
};

/**
 * The next sequential piece of the song for a new slot after slot `at`: the piece after the one the nearest chop at or before `at` plays. With no
 * chop yet it is the piece at `origin`. Returns null when the song has no more of that size.
 */
export function nextSequential(grid: TapGrid, totalFrames: number, colors: readonly string[], state: DiceState, at: number, steps: number, origin: number): MakerChop | null {
  const i = lastChopBefore(state.slots, at);
  if (i < 0) return makePiece(grid, totalFrames, colors, origin, steps);
  const from = sourceStepOf(grid, state, state.slots[i])!;
  return makePiece(grid, totalFrames, colors, snap(from + state.slots[i].steps), steps);
}

/** A copy of slot `at` placed straight after it. */
export function repeatSlot(state: DiceState, at: number): DiceState {
  const slots = state.slots.slice();
  slots.splice(at + 1, 0, { ...slots[at] });
  return { ...state, slots };
}

/** A silence of `steps` steps placed after slot `at` (at the start when `at` is -1). */
export function silenceAfter(state: DiceState, at: number, steps: number): DiceState {
  const slots = state.slots.slice();
  slots.splice(at + 1, 0, { kind: "silence", steps });
  return { ...state, slots };
}

/**
 * Every chop slot gets a random piece of the song of its own length, on the same beat of the bar it sat on in the arrangement (so downbeats stay on
 * downbeats), a different piece than it had when the song holds another. Silence stays.
 */
export function randomize(grid: TapGrid, totalFrames: number, colors: readonly string[], state: DiceState, origin: number, random: () => number = Math.random): DiceState {
  const bar = stepsPerBar(grid.beatsPerBar);
  const end = songSteps(grid, totalFrames);
  const { starts } = slotStarts(state.slots);
  let next: DiceState = { chops: state.chops, slots: [] };
  state.slots.forEach((slot, i) => {
    const keep = () => void (next = { ...next, slots: [...next.slots, slot] });
    if (slot.kind !== "chop") return keep();
    const here = sourceStepOf(grid, state, slot)!;
    // The same place in the bar: the source step and the slot's place in the arrangement differ by whole bars.
    const options: number[] = [];
    for (let s = snap(origin + mod(starts[i], bar)); s + slot.steps <= end + EPS; s = snap(s + bar)) {
      if (makePiece(grid, totalFrames, colors, s, slot.steps)) options.push(s);
    }
    const others = options.filter((s) => Math.abs(s - here) > EPS);
    const pool = others.length ? others : options;
    if (!pool.length) return keep();
    next = withPiece(next, makePiece(grid, totalFrames, colors, pool[Math.floor(random() * pool.length)], slot.steps)!);
  });
  return next;
}

/**
 * The slots that cover steps `from` to `to` of the arrangement: a slot that crosses an edge is cut there, and the part inside is a piece of its own.
 * The result's chops are `state.chops` with any new pieces added at the end, so slot indexes into either list stay valid.
 */
export function rangeSlots(grid: TapGrid, totalFrames: number, colors: readonly string[], state: DiceState, from: number, to: number): DiceState {
  const { starts } = slotStarts(state.slots);
  let out: DiceState = { chops: state.chops, slots: [] };
  state.slots.forEach((slot, i) => {
    const a = Math.max(from, starts[i]);
    const b = Math.min(to, starts[i] + slot.steps);
    if (b - a < EPS) return;
    const steps = snap(b - a);
    const push = (s: Slot) => void (out = { ...out, slots: [...out.slots, s] });
    if (slot.kind === "silence") return push({ kind: "silence", steps });
    if (Math.abs(steps - slot.steps) < EPS) return push(slot);
    const piece = makePiece(grid, totalFrames, colors, snap(sourceStepOf(grid, state, slot)! + (a - starts[i])), steps);
    if (!piece) return push({ kind: "silence", steps });
    const added = withPiece({ chops: out.chops, slots: [] }, piece);
    out = { chops: added.chops, slots: [...out.slots, added.slots[0]] };
  });
  return out;
}

/**
 * Copies steps `from` to `to` over the `count` steps that follow `to`, as many times as fit (the last copy cut short), overwriting what was there. What
 * was after those steps stays after them. A slot that crosses an edge is cut there.
 */
export function copyOver(grid: TapGrid, totalFrames: number, colors: readonly string[], state: DiceState, from: number, to: number, count: number): DiceState {
  if (to - from < EPS || count < EPS) return state;
  const total = slotStarts(state.slots).total;
  const target = to + count;
  let chops = state.chops;
  const part = (a: number, b: number): Slot[] => {
    const r = rangeSlots(grid, totalFrames, colors, { chops, slots: state.slots }, a, b);
    chops = r.chops;
    return r.slots;
  };
  const before = part(0, to);
  const source = part(from, to);
  const after = part(target, Math.max(total, target));
  if (!source.length) return state;
  const body: Slot[] = [];
  let filled = 0;
  while (filled < count - EPS) {
    for (const slot of source) {
      const room = snap(count - filled);
      if (room < EPS) break;
      if (slot.steps <= room + EPS) {
        body.push({ ...slot });
        filled += slot.steps;
        continue;
      }
      // The last copy is cut short: a chop slot of the same piece, a prefix of it.
      if (slot.kind === "silence") body.push({ kind: "silence", steps: room });
      else {
        const piece = makePiece(grid, totalFrames, colors, sourceStepOf(grid, { chops, slots: [] }, slot)!, room);
        if (piece) {
          const added = withPiece({ chops, slots: [] }, piece);
          chops = added.chops;
          body.push(added.slots[0]);
        } else body.push({ kind: "silence", steps: room });
      }
      filled += room;
    }
  }
  return { chops, slots: [...before, ...body, ...after] };
}

/** The bar line (a step) nearest `step`. */
export const nearestBar = (step: number, beatsPerBar: number): number => Math.round(step / stepsPerBar(beatsPerBar)) * stepsPerBar(beatsPerBar);

/** The state without the pieces no slot plays (swapping through the song leaves them behind), the slots renumbered to match. */
export function compact(state: DiceState): DiceState {
  const used = [...new Set(state.slots.flatMap((s) => (s.kind === "chop" ? [s.chop] : [])))].sort((a, b) => a - b);
  const index = new Map(used.map((old, i) => [old, i]));
  return {
    chops: used.map((old, i) => ({ ...state.chops[old], slice: i })),
    slots: state.slots.map((s) => (s.kind === "chop" ? { ...s, chop: index.get(s.chop)! } : s)),
  };
}
