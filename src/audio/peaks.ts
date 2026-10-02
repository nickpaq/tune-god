/**
 * Min and max sample per bucket across all channels, for drawing a waveform. Returns `2 * buckets` values:
 * the minimum then the maximum of each bucket, in order. An empty sound gives all zeros.
 */
export function waveformPeaks(channelData: Float32Array[], buckets: number): Float32Array {
  const out = new Float32Array(buckets * 2);
  const length = channelData[0]?.length ?? 0;
  if (length === 0 || buckets <= 0) return out;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * length) / buckets);
    const end = Math.max(start + 1, Math.floor(((b + 1) * length) / buckets));
    let lo = 0;
    let hi = 0;
    for (const data of channelData) {
      for (let i = start; i < end && i < length; i++) {
        const v = data[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    out[b * 2] = lo;
    out[b * 2 + 1] = hi;
  }
  return out;
}
