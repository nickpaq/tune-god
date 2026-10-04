// Effects the export puts on Koala's mixer strips: a sidechain from the kick bus onto the bass bus, and a heavy, warm
// master chain. Plugin and parameter names are Koala's own, copied from projects with every parameter at its minimum
// and at its maximum, so the values below sit inside the ranges noted beside them. Slots that already hold a plugin
// are never replaced.

/** One effect as Koala writes it into a strip's `chain` (five slots, an empty one is null). */
export interface MixerEffect {
  bypass: boolean;
  name: string;
  parameters: Record<string, number>;
}
export type MixerSlot = MixerEffect | null;

const effect = (name: string, parameters: Record<string, number>): MixerEffect => ({ bypass: false, name, parameters });

/** The bus the sidechain listens to: the kick bus (A, bus 0). The SIDECHAIN plugin's `source` is a bus number. */
export const SIDECHAIN_SOURCE_BUS = 0;

/**
 * Ducks the bass bus whenever the kick bus plays. Threshold -60..0 dB, release 10..1000 ms, output -12..12 dB (an output gain, left at 0).
 * A short release lets the 808 come back under the kick's tail instead of pumping.
 */
export const bassSidechain = (): MixerEffect =>
  effect("SIDECHAIN", { source: SIDECHAIN_SOURCE_BUS, threshold: -24, release: 120, output: 0 });

/**
 * Heavy and warm master chain, in signal order: EQ (three bell bands: a little weight at 60 Hz, a broad gentle cut at 10 kHz), DRIVE (parallel saturation for warmth),
 * COMPRESSOR (slow-attack glue), CLIPPER (shaves the peaks) and LIMITER (the last catch). Ranges: EQ gain +-18 dB, Q 0.5..10;
 * DRIVE drive 0..36 dB, mix 0..1, out -90..0 dB; COMPRESSOR ratio 1..100, attack 0.01..30 ms, release 10..1200 ms, makeup 0/1 (auto make-up, left off);
 * CLIPPER input +-36 dB, output -36..0 dB, threshold about -35..0 dB; LIMITER attack 1.5..6 ms, release 60..1000 ms; `oversample` is the HQ button (0 off, 1 on).
 */
export const masterChain = (): MixerEffect[] => [
  effect("EQ", { "lo freq": 60, "lo gain": 2, "lo Q": 0.7, "mid freq": 1016.1063842773438, "mid gain": 0, "mid Q": 0.5, "hi freq": 10000, "hi gain": -3, "hi Q": 0.5 }),
  effect("DRIVE", { drive: 6, mix: 0.3, out: 0, oversample: 1 }),
  effect("COMPRESSOR", { threshold: -12, ratio: 2, attack: 20, release: 200, makeup: 0, visual: 0 }),
  effect("CLIPPER", { input: 0, output: 0, threshold: -1.5, oversample: 1 }),
  effect("LIMITER", { attack: 1.5, release: 100, gain: 0 }),
];

/** Puts each effect, in order, into the first empty slot after the previous one. Returns false (and changes nothing) when they do not all fit. */
export function fillEmptySlots(chain: MixerSlot[], effects: MixerEffect[]): boolean {
  const slots = [...chain];
  let at = 0;
  for (const fx of effects) {
    while (at < slots.length && slots[at]) at++;
    if (at >= slots.length) return false;
    slots[at++] = fx;
  }
  chain.splice(0, chain.length, ...slots);
  return true;
}
