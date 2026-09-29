/**
 * Peak-normalizes a sample to 0 dBFS, then applies `gainDb` (negative = quieter),
 * so the loudest peak lands at `gainDb` dBFS. Returns new arrays; silent input is copied as-is.
 */
export function normalizeWithGain(channelData: Float32Array[], gainDb: number): Float32Array[] {
  let peak = 0;
  for (const data of channelData) {
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  const gain = peak > 0 ? 10 ** (gainDb / 20) / peak : 1;
  return channelData.map((data) => data.map((v) => v * gain));
}
