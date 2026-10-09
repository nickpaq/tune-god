import { REPEAT_RATES } from "./repeatRates";
interface RepeatState { beat: number; base: number; rate: number; active: boolean; }
const EPSILON = 1e-8;
/** Grid time is shared by all gestures; each lower-rate chunk owns its faster repetitions. */
export class RepeatGrid {
  private states: RepeatState[] = [{ beat: 0, base: 0, rate: 0, active: false }];
  change(rates: readonly number[], nowBeat: number): number {
    const current = this.states.filter(state => state.beat <= nowBeat + EPSILON).at(-1)!;
    const base = rates[0] ?? current.base;
    const span = REPEAT_RATES[current.active ? current.base : base].beats;
    const boundary = (Math.floor((nowBeat + EPSILON) / span) + 1) * span;
    const rate = rates.length ? Math.max(base, rates.at(-1)!) : current.rate;
    const pending = this.states.find(state => Math.abs(state.beat - boundary) < EPSILON);
    const before = this.states.filter(state => state.beat < boundary - EPSILON);
    // A briefly pressed faster division owns at least one complete lower-rate chunk.
    if (pending?.active && pending.rate > pending.base && (!rates.length || pending.rate > rate)) {
      this.states = [...before, pending, { beat: boundary + REPEAT_RATES[pending.base].beats, base, rate, active: rates.length > 0 }];
    } else this.states = [...before, { beat: boundary, base, rate, active: rates.length > 0 }];
    return boundary;
  }
  endBeat(): number | undefined { const last = this.states.at(-1)!; return last.active ? undefined : last.beat; }
  events(from: number, to: number): number[] {
    const result: number[] = [];
    this.states.forEach((state, index) => {
      if (!state.active) return;
      const start = Math.max(from, state.beat), end = Math.min(to, this.states[index + 1]?.beat ?? Infinity);
      const span = REPEAT_RATES[state.base].beats, interval = REPEAT_RATES[state.rate].beats;
      for (let chunk = Math.floor((start + EPSILON) / span) * span; chunk < end - EPSILON; chunk += span) {
        for (let beat = chunk; beat < chunk + span - EPSILON; beat += interval) if (beat >= start - EPSILON && beat < end - EPSILON) result.push(beat);
      }
    });
    return result.sort((a, b) => a - b);
  }
}
