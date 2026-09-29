/** Applies `gainDb` (negative = quieter) to every channel. Returns new arrays. */
export function applyGainDb(channelData: Float32Array[], gainDb: number): Float32Array[] {
  const gain = 10 ** (gainDb / 20);
  return channelData.map((data) => data.map((v) => v * gain));
}
