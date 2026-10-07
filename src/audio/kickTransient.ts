// The kick's main transient, and the soft fade-in the 808s get so it shows through (this replaces the sidechain).
//
// Measuring "the loudest part of the kick in milliseconds": take the kick's envelope (the peak amplitude held over a 14 ms window centred on
// each frame, so it does not dip at every zero crossing of a sub sine; a window longer than half the period of 35 Hz does that), find its peak,
// and measure how long the envelope stays within `withinDb` of that peak (6 dB by default, half the amplitude). That is the stretch of the kick that
// actually carries its level: the click and the punch before the sub tail takes over and falls away. It starts where the envelope first rises to
// within 20 dB of the peak (so a silent lead-in does not count) and ends where it first falls below the threshold after the peak, so a long sub
// tail does not stretch the figure.

/** Envelope window, seconds. */
const WINDOW_SECONDS = 0.014;
/** The envelope counts as started once it is this far under its peak, dB. */
const ONSET_DB = 20;

/** Sliding maximum of `x` over a window centred on each frame (monotonic queue, so it is linear in the length). */
function slidingMax(x: Float32Array, win: number): Float32Array {
  const half = Math.floor(win / 2);
  const out = new Float32Array(x.length);
  const queue = new Int32Array(x.length);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let i = 0; i < x.length; i++) {
    const last = Math.min(x.length - 1, i + half);
    while (next <= last) {
      while (tail > head && x[queue[tail - 1]] <= x[next]) tail--;
      queue[tail++] = next++;
    }
    while (queue[head] < i - half) head++;
    out[i] = x[queue[head]];
  }
  return out;
}

/** How long a kick's main transient is, in milliseconds, or null for a silent sound. */
export function kickTransientMs(channelData: Float32Array[], sampleRate: number, withinDb = 6): number | null {
  const length = channelData[0]?.length ?? 0;
  if (!length) return null;
  const level = new Float32Array(length);
  for (const data of channelData) for (let i = 0; i < length; i++) level[i] = Math.max(level[i], Math.abs(data[i]));
  const env = slidingMax(level, Math.max(1, Math.round(WINDOW_SECONDS * sampleRate)));
  let peak = 0;
  let peakAt = 0;
  for (let i = 0; i < length; i++) {
    if (env[i] > peak) {
      peak = env[i];
      peakAt = i;
    }
  }
  if (peak <= 0) return null;
  const onsetLevel = peak * 10 ** (-ONSET_DB / 20);
  const holdLevel = peak * 10 ** (-withinDb / 20);
  let onset = 0;
  while (onset < peakAt && level[onset] < onsetLevel) onset++;
  let end = peakAt;
  while (end < length && env[end] >= holdLevel) end++;
  // The held envelope runs on for half its window past the last loud sample, so that much comes back off.
  const held = Math.round((WINDOW_SECONDS * sampleRate) / 2);
  return (Math.max(0, end - held - onset) / sampleRate) * 1000;
}

/** The kick-transient length the 808 fade uses for a set of kicks: the median, so one odd kick does not set the fade for the project. */
export function medianTransientMs(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

/** Fade length in milliseconds for a kick transient: the transient itself, held between the preset's smallest and largest fade. */
export function fadeMsFor(transientMs: number, minMs: number, maxMs: number): number {
  return Math.min(maxMs, Math.max(minMs, transientMs));
}

/** A soft fade-in (raised cosine, so it starts and ends without a corner) over the first `ms` of the sound. Returns new arrays. */
export function fadeIn(channelData: Float32Array[], sampleRate: number, ms: number): Float32Array[] {
  const frames = Math.min(channelData[0].length, Math.max(1, Math.round((ms / 1000) * sampleRate)));
  return channelData.map((data) => {
    const out = Float32Array.from(data);
    for (let i = 0; i < frames; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / frames);
    return out;
  });
}
