// Ghost snares and soft kicks: copies of a real snare or kick, baked quieter with a gentle high cut
// (a soft hit is also duller), rendered as their own sample so the pad's volume knob stays at 0 dB.

export type GhostKind = "ghostSnare" | "softKick";

/** Gain baked into the copy. A ghost note is played around a quarter to a third as loud as a backbeat; a soft kick stays closer. */
export const GHOST_LEVEL_DB: Record<GhostKind, number> = { ghostSnare: -14, softKick: -8 };

/** Corner of the one-pole (6 dB per octave) low-pass that dulls the copy. */
export const GHOST_HIGH_CUT_HZ: Record<GhostKind, number> = { ghostSnare: 6000, softKick: 3000 };

export const GHOST_LABEL: Record<GhostKind, string> = { ghostSnare: "Ghost Snare", softKick: "Soft Kick" };

/** A new, quieter and duller copy of `channelData`; the original is untouched. */
export function makeGhostAudio(channelData: Float32Array[], sampleRate: number, kind: GhostKind): Float32Array[] {
  const gain = 10 ** (GHOST_LEVEL_DB[kind] / 20);
  const a = 1 - Math.exp((-2 * Math.PI * GHOST_HIGH_CUT_HZ[kind]) / sampleRate);
  return channelData.map((data) => {
    const out = new Float32Array(data.length);
    let y = 0;
    for (let i = 0; i < data.length; i++) {
      y += a * (data[i] - y);
      out[i] = y * gain;
    }
    return out;
  });
}
