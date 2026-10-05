// A song's waveform at any zoom, drawn at full quality. The audio is summarised once into min/max levels (each level bins twice as many
// frames as the one before), so a column of the screen costs a few bins to draw whether it spans a whole song or a single frame.

/** Frames in a bin of the first level. A view with fewer frames than this per pixel reads the audio itself. */
export const BASE_BIN = 64;

export interface PeakPyramid {
  channelData: Float32Array[];
  totalFrames: number;
  levels: { min: Float32Array; max: Float32Array }[];
  /** The loudest sample in the song: the waveform is scaled to it, so zooming never changes how loud it looks. */
  peak: number;
}

export function buildPyramid(channelData: Float32Array[]): PeakPyramid {
  const totalFrames = channelData[0].length;
  const bins = Math.ceil(totalFrames / BASE_BIN);
  let min = new Float32Array(bins);
  let max = new Float32Array(bins);
  let peak = 0;
  for (let b = 0; b < bins; b++) {
    let lo = 0;
    let hi = 0;
    const to = Math.min(totalFrames, (b + 1) * BASE_BIN);
    for (const data of channelData) {
      for (let i = b * BASE_BIN; i < to; i++) {
        const v = data[i];
        if (v < lo) lo = v;
        else if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
    peak = Math.max(peak, -lo, hi);
  }
  const levels = [{ min, max }];
  while (min.length > 1) {
    const n = Math.ceil(min.length / 2);
    const nextMin = new Float32Array(n);
    const nextMax = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      nextMin[i] = Math.min(min[i * 2], min[i * 2 + 1] ?? 0);
      nextMax[i] = Math.max(max[i * 2], max[i * 2 + 1] ?? 0);
    }
    levels.push({ min: nextMin, max: nextMax });
    min = nextMin;
    max = nextMax;
  }
  return { channelData, totalFrames, levels, peak };
}

/**
 * The lowest and highest sample in each of `columns` equal slices of the view that starts at frame `start` and is `span` frames wide.
 * Frames outside the song are silent.
 */
export function columnPeaks(pyramid: PeakPyramid, start: number, span: number, columns: number, outMin: Float32Array, outMax: Float32Array): void {
  const perPixel = span / columns;
  const { totalFrames, channelData } = pyramid;
  if (perPixel < BASE_BIN) {
    for (let c = 0; c < columns; c++) {
      const from = Math.max(0, Math.floor(start + c * perPixel));
      const to = Math.min(totalFrames, Math.max(from + 1, Math.floor(start + (c + 1) * perPixel)));
      let lo = 0;
      let hi = 0;
      for (const data of channelData) {
        for (let i = from; i < to; i++) {
          const v = data[i];
          if (v < lo) lo = v;
          else if (v > hi) hi = v;
        }
      }
      outMin[c] = lo;
      outMax[c] = hi;
    }
    return;
  }
  const level = Math.min(pyramid.levels.length - 1, Math.max(0, Math.floor(Math.log2(perPixel / BASE_BIN))));
  const size = BASE_BIN * 2 ** level;
  const { min, max } = pyramid.levels[level];
  for (let c = 0; c < columns; c++) {
    const first = start + c * perPixel;
    const last = start + (c + 1) * perPixel;
    const from = Math.max(0, Math.floor(first / size));
    const to = Math.min(min.length - 1, Math.max(from, Math.ceil(last / size) - 1));
    if (last <= 0 || first >= totalFrames) {
      outMin[c] = 0;
      outMax[c] = 0;
      continue;
    }
    let lo = 0;
    let hi = 0;
    for (let b = from; b <= to; b++) {
      if (min[b] < lo) lo = min[b];
      if (max[b] > hi) hi = max[b];
    }
    outMin[c] = lo;
    outMax[c] = hi;
  }
}
