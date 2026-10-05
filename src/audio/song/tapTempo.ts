// Tap tempo that one bad hit cannot throw off. The taps are times in the song (seconds); the estimate is a straight line through the beats they land on.
// A tap is only believed if it lands near where the line says the next beat is, so a stray hit, a double tap or a slip is ignored and the tempo carries
// on. A missed beat is fine (the line just skips a number). If several taps in a row all disagree with the line but agree with each other, the player
// has really changed tempo or phase, and the line starts again from them.

/** Taps closer together than this (seconds) are one hit bouncing: the tempo range tops out at 300 BPM. */
export const MIN_PERIOD_S = 0.2;
/** Taps further apart than this (seconds) start a new count: the tempo range bottoms out at 40 BPM. */
export const MAX_PERIOD_S = 1.5;
/** How far from its beat a tap may land, as a share of a beat, while the line is still being found (fewer than `WARM_TAPS` taps) and afterwards. */
export const WARM_TOLERANCE = 0.3;
export const TOLERANCE = 0.2;
const WARM_TAPS = 5;
/** Taps in a row that all disagree with the line before it is thrown away and started again. */
const RESTART_AFTER = 3;
/** The tempo counts as locked in once this many taps have been believed and they sit this close to the line (as a share of a beat, rms). */
export const LOCK_TAPS = 12;
export const LOCK_RMS = 0.06;
/** The least taps that make a grid worth locking. */
export const MIN_TAPS = 8;

export interface TapEstimate {
  /** Seconds per beat. */
  period: number;
  /** The time (s) of beat 0, which is where the first believed tap was: lines are `origin + n * period`. */
  origin: number;
  bpm: number;
  /** The taps that were believed, in time order. */
  accepted: number[];
  /** The taps that were thrown out: one-off bad hits, bounces, and the taps before a restart. */
  ignored: number[];
  /** How far the believed taps sit from the line, rms, in seconds. */
  rms: number;
  /** Enough taps in a steady rhythm for the grid to be trusted. */
  locked: boolean;
}

interface Believed {
  t: number;
  n: number;
}

/** Least-squares line through (n, t): the period is the slope, the time of beat 0 the intercept. Needs two taps with different n. */
function fit(list: Believed[]): { period: number; origin: number } | null {
  const count = list.length;
  if (count < 2) return null;
  const meanN = list.reduce((s, a) => s + a.n, 0) / count;
  const meanT = list.reduce((s, a) => s + a.t, 0) / count;
  let covariance = 0;
  let variance = 0;
  for (const a of list) {
    covariance += (a.n - meanN) * (a.t - meanT);
    variance += (a.n - meanN) ** 2;
  }
  if (variance === 0) return null;
  const period = covariance / variance;
  return { period, origin: meanT - period * meanN };
}

const plausible = (period: number) => period >= MIN_PERIOD_S && period <= MAX_PERIOD_S;

interface Run {
  list: Believed[];
  line: { period: number; origin: number };
}

/** One pass over the taps: which are believed, and the line through them. */
function run(taps: number[]): Run | null {
  let list: Believed[] = [];
  let line: { period: number; origin: number } | null = null as { period: number; origin: number } | null;
  /** Taps since the last believed one that were not believed. */
  let doubtful: number[] = [];

  const believe = (t: number, n: number) => {
    list.push({ t, n });
    doubtful = [];
    const next = fit(list);
    if (next && plausible(next.period)) line = next;
  };

  for (const t of taps) {
    if (list.length === 0) {
      list.push({ t, n: 0 });
      continue;
    }
    if (!line) {
      // One tap so far: the second one sets the first guess at the tempo.
      const gap = t - list[0].t;
      if (gap < MIN_PERIOD_S) continue; // a bounce
      if (gap > MAX_PERIOD_S) list = [{ t, n: 0 }]; // too long a wait: count again from here
      else believe(t, 1);
      continue;
    }
    const n = Math.round((t - line.origin) / line.period);
    const error = Math.abs(t - (line.origin + n * line.period)) / line.period;
    const tolerance = list.length < WARM_TAPS ? WARM_TOLERANCE : TOLERANCE;
    if (n > list[list.length - 1].n && error <= tolerance) {
      believe(t, n);
      continue;
    }
    doubtful.push(t);
    if (doubtful.length >= RESTART_AFTER) {
      const [a, b, c] = doubtful.slice(-RESTART_AFTER);
      const first = b - a;
      const second = c - b;
      // The taps that disagree with the line agree with each other: the rhythm has changed, so the line is made again from them.
      if (plausible(first) && plausible(second) && Math.abs(first - second) <= 0.25 * Math.min(first, second)) {
        list = [{ t: a, n: 0 }];
        line = null;
        doubtful = [];
        believe(b, 1);
        believe(c, 2);
      }
    }
  }
  return line && list.length >= 2 ? { list, line } : null;
}

/**
 * A stray hit among the first two taps can make the line twice (or three times) as fast as the music, with every real tap landing on every other
 * line. When the believed taps keep a steady gap of `k` lines, the line is made again from just the taps on every k-th one, which makes the real tempo.
 */
function slowerGap(r: Run): number {
  const gaps = r.list.slice(1).map((a, i) => a.n - r.list[i].n);
  const k = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const steady = gaps.filter((g) => g === k).length;
  return k >= 2 && gaps.length >= 3 && steady >= 0.6 * gaps.length ? k : 1;
}

/** The tempo and phase tapped so far, or null until two believable taps have been made. Pass every tap so far, in time order. */
export function estimateTempo(taps: number[]): TapEstimate | null {
  let found = run(taps);
  for (let again = 0; found && again < 3; again++) {
    const k = slowerGap(found);
    if (k === 1) break;
    // Keep the taps that sit on the line numbers most of them share (the same remainder after dividing by k).
    const remainder = (n: number) => ((n % k) + k) % k;
    const counts = new Map<number, number>();
    for (const a of found.list) counts.set(remainder(a.n), (counts.get(remainder(a.n)) ?? 0) + 1);
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    found = run(found.list.filter((a) => remainder(a.n) === common).map((a) => a.t));
  }
  if (!found) return null;
  const { list, line } = found;
  const accepted = list.map((a) => a.t);
  const kept = new Set(accepted);
  const ignored = taps.filter((t) => !kept.has(t));
  const squares = list.reduce((sum, a) => sum + (a.t - (line.origin + a.n * line.period)) ** 2, 0);
  const rms = Math.sqrt(squares / list.length);
  return {
    period: line.period,
    origin: line.origin,
    bpm: 60 / line.period,
    accepted,
    ignored,
    rms,
    locked: list.length >= LOCK_TAPS && rms <= LOCK_RMS * line.period,
  };
}
