import { TICKS_PER_BEAT, type SeqPattern } from "./model";
export const STEPS_PER_ROW = 8;
export function stepLayout(pattern: SeqPattern, beatsPerBar: number, division: number) {
  if (division <= 0 || !Number.isFinite(division)) throw new Error("Step mode needs a quantize division");
  const stepTicks = TICKS_PER_BEAT * 4 / division;
  const count = Math.ceil(pattern.bars * beatsPerBar * TICKS_PER_BEAT / stepTicks);
  return { stepTicks, count, rows: Array.from({ length: Math.ceil(count / STEPS_PER_ROW) }, (_, row) => Array.from({ length: Math.min(STEPS_PER_ROW, count - row * STEPS_PER_ROW) }, (_, column) => row * STEPS_PER_ROW + column)) };
}
export function toggleStep(pattern: SeqPattern, pad: number, step: number, stepTicks: number, pitch = 0, velocity = 100): SeqPattern {
  const tick = Math.round(step * stepTicks);
  const present = pattern.notes.some(note => note.pad === pad && note.pitch === pitch && Math.round(note.tick / stepTicks) === step);
  return { ...pattern, notes: present ? pattern.notes.filter(note => !(note.pad === pad && note.pitch === pitch && Math.round(note.tick / stepTicks) === step)) : [...pattern.notes, { pad, pitch, velocity, tick, length: Math.round(stepTicks) }].sort((a, b) => a.tick - b.tick) };
}
