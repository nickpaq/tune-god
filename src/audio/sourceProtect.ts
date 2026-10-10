// The audio being chopped must outlive any overwrite: when its own pad is chosen as a destination, the chops are still cut from the sound as it was.
// The pad objects are never changed in place (the app replaces them), but the cuts must not depend on that, so the source is copied first and the copy
// is checked before anything is cut from it.
export interface SourceAudio {
  channelData: Float32Array[];
  sampleRate: number;
}

/** An independent copy of the audio (new buffers, same sample values). */
export function protectedCopy<T extends SourceAudio>(source: T): T {
  return { ...source, channelData: source.channelData.map((ch) => ch.slice()) };
}

/** Why a protected copy cannot be used, or null when it matches the original: same channels, same lengths, and the same values at a spread of frames. */
export function copyProblem(original: SourceAudio, copy: SourceAudio): string | null {
  if (copy.sampleRate !== original.sampleRate) return "the protected copy has another sample rate";
  if (copy.channelData.length === 0 || copy.channelData.length !== original.channelData.length) return "the protected copy has the wrong number of channels";
  for (let c = 0; c < original.channelData.length; c++) {
    const a = original.channelData[c];
    const b = copy.channelData[c];
    if (b === a) return "the protected copy shares its buffer with the original";
    if (b.length !== a.length || a.length === 0) return "the protected copy has the wrong length";
    const step = Math.max(1, Math.floor(a.length / 4096));
    for (let i = 0; i < a.length; i += step) if (!Object.is(a[i], b[i])) return "the protected copy differs from the original";
    if (!Object.is(a[a.length - 1], b[a.length - 1])) return "the protected copy differs from the original";
  }
  return null;
}
