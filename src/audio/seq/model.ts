import type { PadFilters } from "./effects";
import type { KeyboardOptions } from "./keyboard";
import { TICKS_PER_BEAT } from "../exportSong";
export { TICKS_PER_BEAT };
export const TRACK_PATTERN_COUNT = 8;
export interface SeqNote { pad: number; tick: number; length: number; pitch: number; velocity: number; gate?: boolean; recordingPass?: string; raw?: Record<string, unknown>; }
export interface SeqPattern { bars: number; notes: SeqNote[]; }
export interface SeqSession { patterns: SeqPattern[]; selected: number[]; muted: boolean[]; gains: number[]; }
export function emptySession(): SeqSession { return { patterns: Array.from({ length: 32 }, () => ({ bars: 1, notes: [] })), selected: [0, 0, 0, 0], muted: [false, false, false, false], gains: [1, 1, 1, 1] }; }
export function readSession(sequence: any, padBase: number): SeqSession {
  const out = emptySession();
  out.patterns = out.patterns.map((empty, i) => {
    const pattern = sequence?.sequences?.[i]?.noteSequence?.pattern;
    return pattern ? { bars: Math.max(1, Number(pattern.numBars) || 1), notes: (pattern.notes ?? []).filter((n: any) => Number(n.num) - padBase >= 0 && Number(n.num) - padBase < 64).map((n: any) => ({ raw: structuredClone(n), pad: Number(n.num) - padBase, tick: Math.max(0, Number(n.timeOffset) || 0), length: Math.max(1, Number(n.length) || TICKS_PER_BEAT / 4), pitch: Number(n.pitch) || 0, velocity: Math.max(1, Math.min(127, Number(n.vel) || 100)) })) } : empty;
  });
  const current = Math.max(0, Math.min(31, Number(sequence?.currSequenceId) || 0));
  out.selected = [current, current, current, current];
  return out;
}
/** Each bank reads only its own notes from its chosen member of Koala's 32-pattern pool. */
export function eventsBetween(session: SeqSession, beatsPerBar: number, fromTick: number, toTick: number): (SeqNote & { absoluteTick: number; bank: number })[] {
  const events: (SeqNote & { absoluteTick: number; bank: number })[] = [];
  for (let bank = 0; bank < 4; bank++) {
    if (session.muted[bank]) continue;
    const pattern = session.patterns[session.selected[bank]];
    const span = pattern.bars * beatsPerBar * TICKS_PER_BEAT;
    const first = Math.floor(fromTick / span), last = Math.floor(toTick / span);
    for (let loop = first; loop <= last; loop++) for (const note of pattern.notes) {
      if (Math.floor(note.pad / 16) !== bank) continue;
      const absoluteTick = loop * span + note.tick;
      if (absoluteTick >= fromTick && absoluteTick < toTick) events.push({ ...note, absoluteTick, bank });
    }
  }
  return events.sort((a, b) => a.absoluteTick - b.absoluteTick);
}
export function quantizedTick(tick: number, division: number, span: number): number {
  const quantum = TICKS_PER_BEAT * 4 / division;
  const at = division > 0 ? Math.round(tick / quantum) * quantum : Math.round(tick);
  return ((at % span) + span) % span;
}
export function writeSession(sequence: any, session: SeqSession, padBase: number) {
  const out = structuredClone(sequence ?? {});
  out.sequences = Array.from({ length: 32 }, (_, i) => {
    const prior = out.sequences?.[i] ?? {};
    return { ...prior, noteSequence: { ...prior.noteSequence, pattern: { ...prior.noteSequence?.pattern, numBars: session.patterns[i].bars, notes: session.patterns[i].notes.map(n => ({ chance: 1, pan: -1.0078740119934082, start: 0, subPad: -1, ...n.raw, length: n.length, num: n.pad + padBase, pitch: n.pitch, timeOffset: n.tick, vel: n.velocity })) } }, parameterSequences: prior.parameterSequences ?? [] };
  });
  out.currSequenceId = session.selected[0];
  return out;
}

/** Piano pads are owned by their own lane, even when their former bank is muted. */
export interface ArrangementLane { id: string; bank?: number; pianoPad?: number; muted: boolean; keyboard?: KeyboardOptions; patterns?: (SeqPattern | null)[]; }
export interface ArrangementSection { bars: number; patterns: Record<string, SeqPattern | null>; selectedSlots?: Record<string, number | null>; }
export interface SeqArrangement { lanes: ArrangementLane[]; sections: ArrangementSection[]; padFilters?: Record<number, PadFilters>; }

/** Flatten the visible lane patterns into one native Koala pattern. */
export function compileArrangement(arrangement: SeqArrangement, beatsPerBar: number): SeqPattern {
  if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) throw new Error("Invalid beats per bar");
  const pianoPads = new Set(arrangement.lanes.flatMap(lane => lane.pianoPad === undefined ? [] : [lane.pianoPad]));
  const notes: SeqNote[] = [];
  let bars = 0;
  for (const section of arrangement.sections) {
    if (!Number.isInteger(section.bars) || section.bars < 1) throw new Error("Invalid section length");
    const duration = section.bars * beatsPerBar * TICKS_PER_BEAT;
    const offset = bars * beatsPerBar * TICKS_PER_BEAT;
    for (const lane of arrangement.lanes) {
      const pattern = section.patterns[lane.id];
      if (lane.muted || !pattern) continue;
      if (!Number.isInteger(pattern.bars) || pattern.bars < 1) throw new Error("Invalid pattern length");
      const span = pattern.bars * beatsPerBar * TICKS_PER_BEAT;
      for (let repeat = 0; repeat < duration; repeat += span) for (const note of pattern.notes) {
        const belongs = lane.pianoPad !== undefined ? note.pad === lane.pianoPad : Math.floor(note.pad / 16) === lane.bank && !pianoPads.has(note.pad);
        const tick = repeat + note.tick;
        if (!belongs || note.tick < 0 || note.tick >= span || tick >= duration) continue;
        notes.push({ ...note, tick: offset + tick, length: note.gate ? Math.min(note.length, duration - tick) : note.length });
      }
    }
    bars += section.bars;
  }
  return { bars: Math.max(1, bars), notes: notes.sort((a, b) => a.tick - b.tick || a.pad - b.pad) };
}

/** Other imported patterns remain in the file; only the chosen arrangement slot is replaced. */
export function writeArrangement(sequence: any, arrangement: SeqArrangement, beatsPerBar: number, padBase: number, slot = 0) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 31) throw new Error("Invalid arrangement slot");
  const session = readSession(sequence, padBase);
  session.patterns[slot] = compileArrangement(arrangement, beatsPerBar);
  const compiled = writeSession(sequence, session, padBase);
  const out = structuredClone(sequence ?? {});
  out.sequences = Array.from({ length: 32 }, (_, i) => i === slot ? compiled.sequences[i] : structuredClone(sequence?.sequences?.[i] ?? compiled.sequences[i]));
  out.beatsPerBar = beatsPerBar;
  out.currSequenceId = slot;
  return out;
}

/** Replace one section of one lane without touching neighbouring sections or other lanes. */
export function replaceLanePattern(arrangement: SeqArrangement, sectionIndex: number, laneId: string, pattern: SeqPattern | null): SeqArrangement {
  if (!arrangement.sections[sectionIndex]) throw new Error("Unknown section");
  if (!arrangement.lanes.some(lane => lane.id === laneId)) throw new Error("Unknown lane");
  return { ...arrangement, sections: arrangement.sections.map((section, i) => {
    if (i !== sectionIndex) return section;
    const patterns = { ...section.patterns, [laneId]: pattern ? structuredClone(pattern) : null };
    return { ...section, patterns, bars: longestSectionPattern({ ...section, patterns }) };
  }) };
}

export type PatternCrop = "first-half" | "last-half";
/** Crop on bar boundaries, and rebase the retained notes to the pattern's beginning. */
export function cropPattern(pattern: SeqPattern, choice: PatternCrop, beatsPerBar: number): SeqPattern {
  if (!Number.isInteger(pattern.bars) || pattern.bars < 1 || beatsPerBar <= 0) throw new Error("Invalid pattern length");
  if (pattern.bars < 2 || pattern.bars % 2 !== 0) throw new Error("Halving requires an even number of bars");
  const bars = pattern.bars / 2;
  const last = choice === "last-half";
  const from = (last ? pattern.bars - bars : 0) * beatsPerBar * TICKS_PER_BEAT;
  const span = bars * beatsPerBar * TICKS_PER_BEAT;
  return { bars, notes: pattern.notes.filter(note => note.tick >= from && note.tick < from + span).map(note => ({ ...note, tick: note.tick - from, length: note.gate ? Math.min(note.length, from + span - note.tick) : note.length })) };
}

export function longestSectionPattern(section: ArrangementSection): number {
  return Math.max(1, ...Object.values(section.patterns).map(pattern => pattern?.bars ?? 1));
}

/** Eight per-track editor slots, independent of the native Koala master pattern. */
export function trackPatterns(lane: ArrangementLane): (SeqPattern | null)[] {
  return Array.from({ length: TRACK_PATTERN_COUNT }, (_, slot) => lane.patterns?.[slot] ?? null);
}
export function setTrackPattern(lane: ArrangementLane, slot: number, pattern: SeqPattern | null): ArrangementLane {
  if (!Number.isInteger(slot) || slot < 0 || slot >= TRACK_PATTERN_COUNT) throw new Error("Track pattern must be between 1 and 8");
  const patterns = trackPatterns(lane);
  patterns[slot] = pattern ? structuredClone(pattern) : null;
  return { ...lane, patterns };
}

/** A repeated single tap removes only this lane from this scene; the stored pattern remains. */
export function toggleScenePattern(arrangement: SeqArrangement, sectionIndex: number, laneId: string, slot: number): SeqArrangement {
  if (!Number.isInteger(slot) || slot < 0 || slot >= TRACK_PATTERN_COUNT) throw new Error("Track pattern must be between 1 and 8");
  const lane = arrangement.lanes.find(lane => lane.id === laneId);
  const section = arrangement.sections[sectionIndex];
  if (!lane || !section) throw new Error("Unknown lane or section");
  const selected = section.selectedSlots?.[laneId] === slot ? null : slot;
  const pattern = selected === null ? null : trackPatterns(lane)[selected] ?? { bars: 1, notes: [] };
  const next = replaceLanePattern(arrangement, sectionIndex, laneId, pattern);
  next.sections[sectionIndex] = { ...next.sections[sectionIndex], selectedSlots: { ...section.selectedSlots, [laneId]: selected } };
  return next;
}
