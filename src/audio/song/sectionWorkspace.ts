import type { RhythmPattern } from "./rhythmLengths";
import { quantizeNote, SHORTEST_NOTE } from "./noteLengths";
import { lineFrame, fineLineNear, type TapGrid } from "./tapGrid";
import {
  stepsPerBar,
  slotStarts,
  type MakerChop,
  type Slot,
  type MakerNote,
} from "./patternMaker";

export const mod = (n: number, span: number) => ((n % span) + span) % span;
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export interface WorkspaceState {
  chops: MakerChop[];
  slots: Slot[];
  cuts: number[];
  rhythm?: RhythmPattern;
}
export interface WorkspaceResult {
  chops: MakerChop[];
  slots: Slot[];
  grid?: TapGrid;
  rhythm?: RhythmPattern;
}

/** Keep the timeline prefix, splitting the crossing piece without changing source data. */
export function slotsThrough(slots: Slot[], endpoint: number): Slot[] {
  const kept: Slot[] = [];
  let at = 0;
  for (const slot of slots) {
    const steps = quantizeNote(Math.min(slot.steps, endpoint - at));
    if (steps <= 0) break;
    kept.push({ ...slot, steps });
    at += steps;
    if (at >= endpoint - 1e-8) break;
  }
  return kept;
}
export function trimPrevious(slots: Slot[], amount: number): Slot[] {
  if (!slots.length) return slots;
  const last = slots[slots.length - 1];
  const steps = quantizeNote(last.steps - amount);
  return steps > 0
    ? [...slots.slice(0, -1), { ...last, steps }]
    : slots.slice(0, -1);
}
export function rewindLastBar(slots: Slot[], beatsPerBar: number): Slot[] {
  const total = slotStarts(slots).total;
  const bar = stepsPerBar(beatsPerBar);
  const endpoint = Math.max(0, Math.floor((total - 1e-8) / bar) * bar);
  return slotsThrough(slots, endpoint);
}

/** The next source position belongs to the last piece's endpoint, not to the assembled timeline. */
export function nextOffset(
  state: WorkspaceState,
  sectionSteps: number,
  grid: TapGrid,
): number {
  const last = state.slots.at(-1);
  if (!last) return 0;
  const prior = [...state.slots].reverse().find((s) => s.kind === "chop");
  if (!prior || prior.kind !== "chop")
    return mod(slotStarts(state.slots).total, sectionSteps);
  const index = state.slots.lastIndexOf(prior);
  const after = state.slots.slice(index).reduce((n, s) => n + s.steps, 0);
  return mod(
    quantizeNote(
      (prior.alignedStart ??
        fineLineNear(grid, state.chops[prior.chop].start, 48) * 4) + after,
    ),
    sectionSteps,
  );
}

/** Replace a selected slot while retaining the complete sequence suffix. */
export function placeCandidate(
  state: WorkspaceState,
  candidate: MakerChop,
  at: number | null = null,
  alignedStart?: number,
): WorkspaceState {
  const next = addCandidate(state, candidate);
  const appended = next.slots.pop()!;
  const slot =
    appended.kind === "chop" && alignedStart !== undefined
      ? { ...appended, alignedStart }
      : appended;
  if (at !== null && at >= 0 && at < state.slots.length)
    next.slots.splice(at, 1, slot);
  else next.slots.push(slot);
  return next;
}

/** Full song sections and inherited candidates use the corrected grid's frames, including its phase anchors. */
export function sourceCandidates(
  grid: TapGrid,
  totalFrames: number,
  bars: number,
  offset: number,
  wanted: number,
  colors: readonly string[],
): MakerChop[] {
  const sectionSteps = bars * stepsPerBar(grid.beatsPerBar);
  const endStep = Math.max(0, Math.floor(fineLineNear(grid, totalFrames) * 4));
  const count = Math.ceil(endStep / sectionSteps);
  const out: MakerChop[] = [];
  for (let section = 0; section < count; section++) {
    const step = section * sectionSteps + offset;
    const steps = Math.min(wanted, sectionSteps - offset, endStep - step);
    const start = Math.round(lineFrame(grid, step / 4));
    const end = Math.min(
      totalFrames,
      Math.round(lineFrame(grid, (step + steps) / 4)),
    );
    if (steps < SHORTEST_NOTE - 1e-9 || start < 0 || end <= start) continue;
    const colorIndex = mod(Math.floor(step / stepsPerBar(grid.beatsPerBar)), 4);
    out.push({
      slice: section,
      start,
      length: end - start,
      steps,
      bars: steps / stepsPerBar(grid.beatsPerBar),
      barIndex: Math.floor(step / stepsPerBar(grid.beatsPerBar)),
      colorIndex,
      color: colors[colorIndex],
    });
  }
  return out;
}

export function addCandidate(
  state: WorkspaceState,
  candidate: MakerChop,
): WorkspaceState {
  let chop = state.chops.findIndex(
    (c) =>
      c.start === candidate.start &&
      c.length === candidate.length &&
      c.steps === candidate.steps,
  );
  const chops = state.chops.slice();
  if (chop < 0) {
    chop = chops.length;
    chops.push(candidate);
  }
  return {
    ...state,
    chops,
    slots: [...state.slots, { kind: "chop", chop, steps: candidate.steps }],
  };
}

/** Choose a quiet crossing within 1 ms, common to all channels. The musical step remains untouched. */
export function quietBoundary(
  data: readonly Float32Array[],
  frame: number,
  radius: number,
): number {
  const total = data[0].length;
  const at = clamp(Math.round(frame), 0, total);
  if (at === 0 || at === total) return at;
  let best = at,
    score = Infinity;
  for (
    let i = Math.max(1, at - radius);
    i <= Math.min(total - 1, at + radius);
    i++
  ) {
    const crossing = data.some(
      (c) => (c[i - 1] <= 0 && c[i] >= 0) || (c[i - 1] >= 0 && c[i] <= 0),
    );
    if (!crossing) continue;
    const energy =
      data.reduce((n, c) => n + Math.abs(c[i]) + Math.abs(c[i - 1]), 0) +
      Math.abs(i - at) * 0.00001;
    if (energy < score) {
      score = energy;
      best = i;
    }
  }
  return best;
}

export interface PieceFades {
  fadeIn?: number;
  fadeOut?: number;
}
/** Repeated choices share the strongest required boundary fades, so preview and packed slices agree. */
export function slotFades(slots: readonly Slot[], at: number): PieceFades {
  const slot = slots[at];
  if (!slot || slot.kind === "silence") return {};
  let fadeIn = 0.002,
    fadeOut = 0.002;
  slots.forEach((s, i) => {
    if (s.kind !== "chop" || s.chop !== slot.chop || s.steps !== slot.steps)
      return;
    if (slots[i - 1]?.kind === "silence") fadeIn = 0.003;
    if (slots[i + 1]?.kind === "silence") fadeOut = 0.005;
  });
  return { fadeIn, fadeOut };
}

/** A piece stays on its musical duration. Quiet boundaries only change which source frames fill it. */
export function pieceAudio(
  data: readonly Float32Array[],
  chop: MakerChop,
  steps: number,
  beatFrames: number,
  rate: number,
  fades: PieceFades = {},
): Float32Array[] {
  const length = Math.max(1, Math.round((steps * beatFrames) / 4));
  const radius = Math.max(1, Math.round(rate * 0.001));
  const from = quietBoundary(data, chop.start, radius);
  const end = Math.max(
    from,
    quietBoundary(
      data,
      Math.min(chop.start + chop.length, chop.start + length),
      radius,
    ),
  );
  const fadeIn = Math.min(
    Math.round(rate * (fades.fadeIn ?? 0.002)),
    Math.floor(length / 2),
  );
  const fadeOut = Math.min(
    Math.round(rate * (fades.fadeOut ?? 0.002)),
    Math.floor(length / 2),
  );
  return data.map((channel) => {
    const out = new Float32Array(length);
    out.set(channel.subarray(from, Math.min(end, from + length)));
    for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
    for (let i = 0; i < fadeOut; i++) out[length - 1 - i] *= i / fadeOut;
    // If the source ended before its musical duration, soften that actual end too.
    const filled = Math.min(length, end - from);
    if (filled < length)
      for (let i = 0; i < Math.min(fadeOut, filled); i++)
        out[filled - 1 - i] *= i / Math.max(1, fadeOut);
    return out;
  });
}

/** Pack independent pieces, so overlapping source choices cannot cut each other short in Koala's slicer. */
export function packArrangement(
  data: readonly Float32Array[],
  chops: readonly MakerChop[],
  slots: readonly Slot[],
  beatFrames: number,
  rate: number,
) {
  const unique: { chop: number; steps: number; audio: Float32Array[] }[] = [];
  const notes: MakerNote[] = [];
  const { starts } = slotStarts(slots);
  slots.forEach((slot, i) => {
    if (slot.kind === "silence") return;
    let slice = unique.findIndex(
      (u) => u.chop === slot.chop && u.steps === slot.steps,
    );
    if (slice < 0) {
      if (unique.length >= 127)
        throw new Error(
          "This arrangement uses more than 127 different pieces. Remove a piece or reuse an existing one.",
        );
      slice = unique.length;
      unique.push({
        chop: slot.chop,
        steps: slot.steps,
        audio: pieceAudio(
          data,
          chops[slot.chop],
          slot.steps,
          beatFrames,
          rate,
          slotFades(slots, i),
        ),
      });
    }
    notes.push({ slice, start: starts[i], steps: slot.steps });
  });
  if (unique.length > 127)
    throw new Error(
      "This arrangement uses more than 127 different pieces. Remove a piece or reuse an existing one.",
    );
  const sliceStarts: number[] = [];
  let frames = 0;
  for (const u of unique) {
    sliceStarts.push(frames);
    frames += u.audio[0].length;
  }
  // A silence-only pattern still needs a valid silent chopper slice.
  if (!sliceStarts.length) sliceStarts.push(0);
  const channelData = data.map((_, c) => {
    const out = new Float32Array(Math.max(1, frames));
    unique.forEach((u, i) => out.set(u.audio[c], sliceStarts[i]));
    return out;
  });
  return {
    channelData,
    notes,
    layout: {
      starts: sliceStarts,
      sections: unique.map((u, slice) => ({ slice, bars: u.steps / 16 })),
    },
  };
}
