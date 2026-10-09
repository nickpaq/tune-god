
/* Music Tempo
MIT License

Copyright (c) 2017 killercrush

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Web Audio Beat Detector
MIT License

Copyright (c) 2026 Christoph Guttandin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


*/

function fft(re              , im              )       {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}


const original = (() => {
// Tempo, bar-1 position and key of a whole song. Everything here is a suggestion for the chop editor: the user checks the grid
// against the waveform and nudges it, because a cut that is a few milliseconds out cannot be fixed once the sections are rendered.

/** The song is analysed at about this rate: plenty for beats and harmony, and four times less audio to chew through. */
const ANALYSIS_RATE = 11025;
const FRAME = 512;
const HOP = 64;
const MIN_BPM = 60;
const MAX_BPM = 200;
/** A spectral peak counts as a note when it is this many times louder than the bins around it. */
const PEAK_PROMINENCE = 4;

/** The mono mix of a song. */
function mixToMono(channelData                )               {
  if (channelData.length === 1) return Float32Array.from(channelData[0]);
  const out = new Float32Array(channelData[0].length);
  for (const data of channelData) for (let i = 0; i < out.length; i++) out[i] += data[i];
  const scale = 1 / channelData.length;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/** Averages groups of samples: a crude low-pass and decimation, good enough for finding beats and notes. */
function decimate(mono              , factor        )               {
  if (factor <= 1) return mono;
  const out = new Float32Array(Math.floor(mono.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += mono[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

                         
                                                                    
                     
                                                                                                                             
                    
                     
                                                                                              
                             
 

/** How strongly the sound changes, frame by frame (log-compressed spectral flux). */
function onsetStrength(x              , rate        )         {
  const frames = Math.max(0, Math.floor((x.length - FRAME) / HOP));
  const flux = new Float32Array(frames);
  const low = new Float32Array(frames);
  const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  const bins = FRAME / 2;
  const topBin = Math.min(bins, Math.round(4000 / (rate / FRAME)));
  const lowBin = Math.max(2, Math.round(200 / (rate / FRAME)));
  let previous = new Float64Array(bins);
  let current = new Float64Array(bins);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = x[f * HOP + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    let lowSum = 0;
    for (let k = 1; k < topBin; k++) {
      current[k] = Math.log1p((30 * 4 * Math.hypot(re[k], im[k])) / FRAME);
      if (f > 0) {
        const rise = current[k] - previous[k];
        if (rise > 0) {
          sum += rise;
          if (k < lowBin) lowSum += rise;
        }
      }
    }
    flux[f] = sum;
    low[f] = lowSum;
    [previous, current] = [current, previous];
  }
  return { flux, low, hopSeconds: HOP / rate, frameOffsetSeconds: FRAME / 2 / rate };
}

/** Subtracts a local average so steady loudness does not count as rhythm, and keeps only what rises above it. */
function emphasize(flux              , hopSeconds        )               {
  const half = Math.max(1, Math.round(0.4 / hopSeconds));
  const out = new Float32Array(flux.length);
  const prefix = new Float64Array(flux.length + 1);
  for (let i = 0; i < flux.length; i++) prefix[i + 1] = prefix[i] + flux[i];
  for (let i = 0; i < flux.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(flux.length, i + half + 1);
    out[i] = Math.max(0, flux[i] - (prefix[b] - prefix[a]) / (b - a));
  }
  return out;
}

                             
              
                                                 
                     
 

/** The likeliest tempos, best first. A song heard at half or double speed is the usual mistake, so those are always worth offering. */
function tempoCandidates(flux              , hopSeconds        , low               )               {
  const minLag = Math.max(2, Math.floor(60 / (MAX_BPM * hopSeconds)));
  const maxLag = Math.ceil(60 / (MIN_BPM * hopSeconds));
  const autocorrelation = (source              ) => {
    const x = emphasize(source, hopSeconds);
    const acf = new Float64Array(maxLag * 4 + 2);
    for (let lag = minLag; lag < acf.length && lag < x.length / 2; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < x.length; i++) sum += x[i] * x[i + lag];
      acf[lag] = sum / (x.length - lag);
    }
    const top = acf.reduce((m, v) => Math.max(m, v), 0);
    return top > 0 ? acf.map((v) => v / top) : acf;
  };
  // The whole spectrum says where the rhythm is; the bass says where the beat is (hats between the beats would otherwise double the tempo).
  const whole = autocorrelation(flux);
  const bass = low ? autocorrelation(low) : null;
  const acf = whole.map((v, i) => v + (bass ? 1.5 * bass[i] : 0));
  // A beat period is also a period at two and four times its length, so those add to its score.
  const score = new Float64Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * hopSeconds);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.8) ** 2);
    score[lag] = (acf[lag] + 0.5 * acf[lag * 2] + 0.25 * acf[lag * 4]) * (0.5 + 0.5 * prior);
    best = Math.max(best, score[lag]);
  }
  if (best <= 0) return [];
  const peaks                                   = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (score[lag] > score[lag - 1] && score[lag] >= score[lag + 1] && score[lag] > 0.15 * best) peaks.push({ lag, value: score[lag] });
  }
  peaks.sort((a, b) => b.value - a.value);
  const chosen               = [];
  for (const { lag, value } of peaks) {
    // Parabolic interpolation puts the peak between lags.
    const a = score[lag - 1];
    const b = score[lag];
    const c = score[lag + 1];
    const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
    const bpm = 60 / ((lag + shift) * hopSeconds);
    if (chosen.some((g) => Math.abs(g.bpm - bpm) / bpm < 0.03)) continue;
    chosen.push({ bpm, confidence: value / best });
    if (chosen.length >= 4) break;
  }
  return chosen;
}

/**
 * How well a tempo makes the music repeat: the bar-level loop of a beat (a pattern of 3-3-2 kicks reads as triplets at two thirds of the real tempo) comes
 * back after 4, 8 or 16 whole beats, so the real tempo has the strongest self-similarity at those lags. 0..1.
 */
function loopFit(onsets        , bpm        )         {
  const peak = (v              ) => v.reduce((m, q) => Math.max(m, q), 0) || 1;
  const flux = emphasize(onsets.flux, onsets.hopSeconds);
  const low = emphasize(onsets.low, onsets.hopSeconds);
  const fluxPeak = peak(flux);
  const lowPeak = peak(low);
  const x = flux.map((v, i) => v / fluxPeak + (1.5 * low[i]) / lowPeak);
  const correlation = (lag        ) => {
    const whole = Math.floor(lag);
    const frac = lag - whole;
    let sum = 0;
    for (let i = 0; i + whole + 1 < x.length; i++) sum += x[i] * (x[i + whole] * (1 - frac) + x[i + whole + 1] * frac);
    return sum / (x.length - whole);
  };
  const zero = correlation(0);
  const beat = 60 / bpm / onsets.hopSeconds;
  const lags = [4, 8, 16].filter((k) => k * beat < x.length / 2);
  if (zero <= 0 || lags.length === 0) return 0;
  return lags.reduce((s, k) => s + correlation(k * beat) / zero, 0) / lags.length;
}

/**
 * The tempo to use among the likely ones: the best-scored one, unless another that is almost as clear makes the music repeat clearly better (the
 * best-scored one then cuts the pattern at a length that is not a whole number of beats).
 */
function chooseTempo(onsets        , candidates              )             {
  const fits = candidates.map((c) => ({ c, fit: c.confidence >= 0.6 ? loopFit(onsets, c.bpm) : 0 }));
  const top = fits[0];
  const better = fits.filter((f) => f.fit > 1.3 * top.fit && f.fit > 0.1);
  const best = better.length === 0 ? top.c : better.sort((a, b) => b.fit - a.fit)[0].c;
  // A tempo picked for its repeat can be half of the usual one: a slow pick with a clear double that is a usual tempo is taken at the double.
  const double = candidates.find((c) => c.confidence >= 0.6 && Math.abs(c.bpm / best.bpm - 2) < 0.06 && c.bpm <= 160);
  return better.length > 0 && best.bpm < 80 && double ? double : best;
}

/** A value read between frames. */
function at(x              , position        )         {
  const i = Math.floor(position);
  if (i < 0 || i + 1 >= x.length) return 0;
  const f = position - i;
  return x[i] * (1 - f) + x[i + 1] * f;
}

                           
                                                                                  
                        
                                                                                  
                        
                                                                           
                   
 

/**
 * Lays a beat grid over the onsets: the best phase for the first guess of the tempo, then a straight-line fit through the
 * onset nearest every predicted beat, so a tempo that is a fraction of a BPM out is corrected by hundreds of beats of evidence.
 */
function fitBeatGrid(onsets        , bpm        )                  {
  const x = emphasize(onsets.flux, onsets.hopSeconds);
  if (x.length < 8) return null;
  let period = 60 / bpm / onsets.hopSeconds; // frames
  let origin = 0;
  let bestScore = -1;
  for (let phase = 0; phase < period; phase += 0.5) {
    let sum = 0;
    for (let p = phase; p < x.length - 1; p += period) sum += at(x, p);
    if (sum > bestScore) {
      bestScore = sum;
      origin = phase;
    }
  }
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  let coverage = 0;
  for (let pass = 0; pass < 4; pass++) {
    const found                                                 = [];
    const radius = Math.max(1, Math.round(0.12 * period));
    const beats = Math.floor((x.length - 1 - origin) / period);
    for (let k = 0; k <= beats; k++) {
      const predicted = origin + k * period;
      let peak = -1;
      let peakFrame = -1;
      for (let i = Math.max(1, Math.round(predicted) - radius); i <= Math.min(x.length - 2, Math.round(predicted) + radius); i++) {
        if (x[i] > peak) {
          peak = x[i];
          peakFrame = i;
        }
      }
      if (peakFrame < 0 || peak < 1.5 * mean) continue;
      // Parabolic interpolation for a position between frames.
      const a = x[peakFrame - 1];
      const b = x[peakFrame];
      const c = x[peakFrame + 1];
      const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
      found.push({ k, frame: peakFrame + Math.max(-0.5, Math.min(0.5, shift)), weight: peak });
    }
    if (found.length < 4) return null;
    coverage = found.length / (beats + 1);
    // Weighted straight line through (k, frame), dropping the worst misses on the later passes.
    let use = found;
    for (let round = 0; round < 2; round++) {
      let sw = 0;
      let sk = 0;
      let sf = 0;
      let skk = 0;
      let skf = 0;
      for (const p of use) {
        sw += p.weight;
        sk += p.weight * p.k;
        sf += p.weight * p.frame;
        skk += p.weight * p.k * p.k;
        skf += p.weight * p.k * p.frame;
      }
      const denominator = sw * skk - sk * sk;
      if (denominator === 0) return null;
      period = (sw * skf - sk * sf) / denominator;
      origin = (sf - period * sk) / sw;
      use = found.filter((p) => Math.abs(p.frame - (origin + p.k * period)) < 0.05 * period);
      if (use.length < 4) return null;
    }
  }
  return {
    periodSeconds: period * onsets.hopSeconds,
    originSeconds: origin * onsets.hopSeconds + onsets.frameOffsetSeconds,
    coverage,
  };
}

                           
                                                                   
                
                                                                              
                     
                                                                                                                                     
                 
 

/** How hard the bass (`low`) and the rest of the sound (`all`) hit on every beat of the grid, from the last beat before 0 that is still in the music's first moments. */
function beatStrengths(onsets        , grid          )                                            {
  const lowAll = emphasize(onsets.low, onsets.hopSeconds);
  const fluxAll = emphasize(onsets.flux, onsets.hopSeconds);
  const first = Math.ceil((-0.3 * grid.periodSeconds - grid.originSeconds) / grid.periodSeconds);
  const beats = Math.floor((onsets.flux.length * onsets.hopSeconds - grid.originSeconds) / grid.periodSeconds);
  const out                                            = [];
  for (let k = first; k <= beats; k++) {
    const frame = (grid.originSeconds - onsets.frameOffsetSeconds + k * grid.periodSeconds) / onsets.hopSeconds;
    // The strongest frame within a few around the beat, so a little timing slack does not lose the hit.
    let low = 0;
    let all = 0;
    for (let d = -2; d <= 2; d++) {
      low = Math.max(low, at(lowAll, frame + d));
      all = Math.max(all, at(fluxAll, frame + d));
    }
    out.push({ k, low, all });
  }
  return out;
}

/**
 * The first beat (its number on the grid, which may be -1 for a hit at the very start) that is a big bass hit: most of the way up to a strong kick of the
 * song. Producers put the first big kick on the 1. Null when the song has no bass hits to speak of.
 */
function firstBigBeat(onsets        , grid          , allowed                         )                {
  const beats = beatStrengths(onsets, grid);
  const sorted = beats.map((b) => b.low).sort((x, y) => x - y);
  const strong = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const hit = strong > 0 ? beats.find((b) => b.low >= 0.6 * strong && (!allowed || allowed(b.k))) : undefined;
  return hit ? hit.k : null;
}

/** Which of the `beatsPerBar` beats is beat 1: the one the bass lands on hardest. */
function pickDownbeat(onsets        , grid          , beatsPerBar        )           {
  const sums = new Float64Array(beatsPerBar);
  const counts = new Float64Array(beatsPerBar);
  for (const { k, low, all } of beatStrengths(onsets, grid)) {
    if (k < 0) continue;
    sums[k % beatsPerBar] += low + 0.15 * all; // loud hats on the 2 and 4 must not outweigh the bass
    counts[k % beatsPerBar]++;
  }
  const means = Array.from(sums, (s, i) => (counts[i] ? s / counts[i] : 0));
  const order = means.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const best = order[0];
  const second = order[1] ?? { v: 0 };
  const near = order.filter((o) => o.v >= 0.9 * best.v).map((o) => o.i);
  return { phase: best.i, near, confidence: best.v > 0 ? Math.max(0, Math.min(1, (best.v - second.v) / best.v)) : 0 };
}

/**
 * Where bar 1 goes: the first bar line (from the grid and the beat found to open the bar) whose downbeat is a big peak, at least half as strong as the
 * song's typical downbeat (or the first bar line when the music is already playing at the start). Intros are made of small, soft onsets that the first loud-ish frame would mistake for the start. Seconds from the start of the file.
 */
function firstBigBar(onsets        , grid          , phase        , beatsPerBar        , playingAtStart = false)         {
  const lowAll = emphasize(onsets.low, onsets.hopSeconds);
  const fluxAll = emphasize(onsets.flux, onsets.hopSeconds);
  const bar = grid.periodSeconds * beatsPerBar;
  const origin = grid.originSeconds + phase * grid.periodSeconds;
  const end = onsets.flux.length * onsets.hopSeconds;
  const first = Math.ceil((-0.3 * grid.periodSeconds - origin) / bar);
  const last = Math.floor((end - origin) / bar);
  const strengths           = [];
  for (let b = first; b <= last; b++) {
    const frame = (origin + b * bar - onsets.frameOffsetSeconds) / onsets.hopSeconds;
    let low = 0;
    let all = 0;
    for (let d = -2; d <= 2; d++) {
      low = Math.max(low, at(lowAll, frame + d));
      all = Math.max(all, at(fluxAll, frame + d));
    }
    strengths.push(low + 0.5 * all);
  }
  const typical = [...strengths].sort((a, b) => a - b)[Math.floor(strengths.length / 2)] ?? 0;
  // A file that opens on music already playing (cut from a longer loop) has its bar 1 at its start, however soft that bar line's own onset is.
  const index = playingAtStart ? 0 : typical > 0 ? strengths.findIndex((v) => v >= 0.5 * typical) : -1;
  return origin + (first + Math.max(0, index)) * bar;
}

/**
 * Moves a position onto the sound's real attack. The beat grid is accurate to a few milliseconds, but the first sample of
 * a kick is what a cut should land on. Looks within `radius` frames of `center` for the sharpest rise in loudness.
 */
function snapToAttack(mono              , center        , radius        , minContrast = 0)         {
  const smooth = 8;
  let best = -Infinity;
  let at = Math.round(center);
  let level = 0;
  const from = Math.max(smooth, Math.round(center) - radius);
  const to = Math.min(mono.length - smooth - 1, Math.round(center) + radius);
  for (let i = from; i <= to; i++) {
    let before = 0;
    let after = 0;
    for (let j = 1; j <= smooth; j++) {
      before += Math.abs(mono[i - j]);
      after += Math.abs(mono[i + j - 1]);
    }
    const rise = after - before;
    level += after;
    if (rise > best) {
      best = rise;
      at = i;
    }
  }
  // With a contrast asked for, a rise that is no bigger than the window's own level is noise or a swell, not an attack: stay where the caller pointed.
  const count = Math.max(1, to - from + 1);
  if (minContrast > 0 && best < minContrast * (level / count)) return Math.round(center);
  return at;
}

                           
                                     
             
                 
                                                               
                     
 

// Krumhansl-Kessler key profiles: how much each note belongs in a major or a minor key, from the tonic up.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a                   , b                   )         {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** How much of each of the twelve notes the song holds, over the whole song, corrected for a song that is tuned off A=440. */
function chromaOf(x              , rate        )               {
  const size = 4096;
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const first = Math.ceil(65 / (rate / size));
  const last = Math.floor(2000 / (rate / size));
  const spectrum = new Float64Array(size / 2);
  const total = new Float64Array(size / 2);
  for (let start = 0; start + size <= x.length; start += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = x[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let frameMax = 0;
    for (let k = Math.max(1, first - 12); k <= Math.min(size / 2 - 1, last + 12); k++) {
      spectrum[k] = Math.hypot(re[k], im[k]);
      if (k >= first && k <= last) frameMax = Math.max(frameMax, spectrum[k]);
    }
    if (frameMax <= 0) continue;
    // Each frame counts by its own loudness only a little, so a quiet verse weighs about as much as a loud chorus.
    for (let k = first; k <= last; k++) {
      // Only peaks that stand well above the bins around them are notes: noise (hats, the body of a snare) has peaks everywhere, but none that rise like a held note.
      if (!(spectrum[k] > spectrum[k - 1] && spectrum[k] >= spectrum[k + 1])) continue;
      let around = 0;
      let count = 0;
      for (let j = Math.max(1, k - 12); j <= Math.min(size / 2 - 1, k + 12); j++) {
        if (Math.abs(j - k) <= 2) continue;
        around += spectrum[j];
        count++;
      }
      if (spectrum[k] > PEAK_PROMINENCE * (around / count)) total[k] += Math.sqrt(spectrum[k] / frameMax);
    }
  }
  const binHz = rate / size;
  // The song's tuning: the weighted average distance of its peaks from the nearest note of A=440.
  let sx = 0;
  let sy = 0;
  for (let k = first; k <= last; k++) {
    if (!total[k]) continue;
    const midi = 69 + 12 * Math.log2((k * binHz) / 440);
    const angle = 2 * Math.PI * (midi - Math.round(midi));
    sx += total[k] * Math.cos(angle);
    sy += total[k] * Math.sin(angle);
  }
  const detune = Math.atan2(sy, sx) / (2 * Math.PI);
  const chroma = new Float64Array(12);
  for (let k = first; k <= last; k++) {
    if (!total[k]) continue;
    const midi = 69 + 12 * Math.log2((k * binHz) / 440) - detune;
    chroma[((Math.round(midi) % 12) + 12) % 12] += total[k];
  }
  return chroma;
}

/** The likeliest key, from a song's chroma (index 0 = C). */
function keyOfChroma(chroma                   )           {
  const scores                                                  = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = (profile          ) => profile.map((_, i) => profile[(i - tonic + 12) % 12]);
    scores.push({ pc: tonic, minor: false, value: correlation(chroma, rotated(MAJOR)) });
    scores.push({ pc: tonic, minor: true, value: correlation(chroma, rotated(MINOR)) });
  }
  scores.sort((a, b) => b.value - a.value);
  const best = scores[0];
  // The relative major or minor shares all its notes, so it is no real rival: compare with the best key that is neither.
  const relativePc = best.minor ? (best.pc + 3) % 12 : (best.pc + 9) % 12;
  const rival = scores.find((s) => !(s.pc === best.pc && s.minor === best.minor) && !(s.pc === relativePc && s.minor !== best.minor)) ?? scores[1];
  return { pc: best.pc, minor: best.minor, confidence: Math.max(0, Math.min(1, (best.value - rival.value) / Math.max(0.01, Math.abs(best.value)))) };
}

                               
              
                                                            
                              
                                                                                          
                          
                                                                             
                                                                             
                
 

/** Whether the file opens on music at close to its usual loudness (not a fade-in or a quiet intro): the first quarter second against the median quarter second. */
function playingAtStart(mono              , sampleRate        )          {
  const size = Math.round(0.25 * sampleRate);
  const blocks = Math.floor(mono.length / size);
  if (blocks < 8) return false;
  const rms = Array.from({ length: blocks }, (_, b) => {
    let sum = 0;
    for (let i = b * size; i < (b + 1) * size; i++) sum += mono[i] * mono[i];
    return Math.sqrt(sum / size);
  });
  const median = [...rms].sort((a, b) => a - b)[Math.floor(blocks / 2)];
  return median > 0 && rms[0] >= 0.5 * median;
}

/** Tempo, bar 1 and key of a song, from its mono mix. Null when no beat could be found. */
function analyzeSong(mono              , sampleRate        , beatsPerBar        )                      {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  const x = decimate(mono, factor);
  const rate = sampleRate / factor;
  const onsets = onsetStrength(x, rate);
  const candidates = tempoCandidates(onsets.flux, onsets.hopSeconds, onsets.low);
  if (!candidates.length) return null;
  const tempo = chooseTempo(onsets, candidates);
  const grid = fitBeatGrid(onsets, tempo.bpm);
  if (!grid) return null;
  const downbeat = pickDownbeat(onsets, grid, beatsPerBar);

  // The first bar line whose downbeat is a big hit, so a quiet intro of pads, risers or ghost notes does not count as where the music starts.
  // When the bass does not clearly favour one beat (a syncopated kick pattern ties two), the first big hit of the song is taken as the 1.
  const first = downbeat.confidence < 0.5 ? firstBigBeat(onsets, grid, (k) => downbeat.near.includes(((k % beatsPerBar) + beatsPerBar) % beatsPerBar)) : null;
  const phase = first === null ? downbeat.phase : ((first % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const rough = firstBigBar(onsets, grid, phase, beatsPerBar, playingAtStart(mono, sampleRate));
  const snapped = snapToAttack(mono, rough * sampleRate, Math.round(0.03 * sampleRate)) / sampleRate;

  const key = keyOfChroma(chromaOf(x, rate));
  const bpm = 60 / grid.periodSeconds;
  return {
    bpm,
    tempoAlternatives: [bpm / 2, bpm * 2].filter((b) => b >= 40 && b <= 240),
    downbeatSeconds: snapped,
    confidence: { tempo: tempo.confidence, grid: grid.coverage, downbeat: downbeat.confidence, key: key.confidence },
    key,
  };
}


return analyzeSong;
})();
const corrected = (() => {
// Tempo, bar-1 position and key of a whole song. Everything here is a suggestion for the chop editor: the user checks the grid
// against the waveform and nudges it, because a cut that is a few milliseconds out cannot be fixed once the sections are rendered.

/** The song is analysed at about this rate: plenty for beats and harmony, and four times less audio to chew through. */
const ANALYSIS_RATE = 11025;
const FRAME = 512;
const HOP = 64;
const MIN_BPM = 60;
const MAX_BPM = 200;
/** A spectral peak counts as a note when it is this many times louder than the bins around it. */
const PEAK_PROMINENCE = 4;

/** The mono mix of a song. */
function mixToMono(channelData                )               {
  if (channelData.length === 1) return Float32Array.from(channelData[0]);
  const out = new Float32Array(channelData[0].length);
  for (const data of channelData) for (let i = 0; i < out.length; i++) out[i] += data[i];
  const scale = 1 / channelData.length;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/** Averages groups of samples: a crude low-pass and decimation, good enough for finding beats and notes. */
function decimate(mono              , factor        )               {
  if (factor <= 1) return mono;
  const out = new Float32Array(Math.floor(mono.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += mono[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

                         
                                                                    
                     
                                                                                                                             
                    
                     
                                                                                              
                             
 

/** How strongly the sound changes, frame by frame (log-compressed spectral flux). */
function onsetStrength(x              , rate        )         {
  const frames = Math.max(0, Math.floor((x.length - FRAME) / HOP));
  const flux = new Float32Array(frames);
  const low = new Float32Array(frames);
  const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  const bins = FRAME / 2;
  const topBin = Math.min(bins, Math.round(4000 / (rate / FRAME)));
  const lowBin = Math.max(2, Math.round(200 / (rate / FRAME)));
  let previous = new Float64Array(bins);
  let current = new Float64Array(bins);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = x[f * HOP + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    let lowSum = 0;
    for (let k = 1; k < topBin; k++) {
      current[k] = Math.log1p((30 * 4 * Math.hypot(re[k], im[k])) / FRAME);
      {
        const rise = current[k] - previous[k];
        if (rise > 0) {
          sum += rise;
          if (k < lowBin) lowSum += rise;
        }
      }
    }
    flux[f] = sum;
    low[f] = lowSum;
    [previous, current] = [current, previous];
  }
  return { flux, low, hopSeconds: HOP / rate, frameOffsetSeconds: FRAME / 2 / rate };
}

/** Subtracts a local average so steady loudness does not count as rhythm, and keeps only what rises above it. */
function emphasize(flux              , hopSeconds        )               {
  const half = Math.max(1, Math.round(0.4 / hopSeconds));
  const out = new Float32Array(flux.length);
  const prefix = new Float64Array(flux.length + 1);
  for (let i = 0; i < flux.length; i++) prefix[i + 1] = prefix[i] + flux[i];
  for (let i = 0; i < flux.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(flux.length, i + half + 1);
    out[i] = Math.max(0, flux[i] - (prefix[b] - prefix[a]) / (b - a));
  }
  return out;
}

                             
              
                                                 
                     
 

/** The likeliest tempos, best first. A song heard at half or double speed is the usual mistake, so those are always worth offering. */
function tempoCandidates(flux              , hopSeconds        , low               )               {
  const minLag = Math.max(2, Math.floor(60 / (MAX_BPM * hopSeconds)));
  const maxLag = Math.ceil(60 / (MIN_BPM * hopSeconds));
  const autocorrelation = (source              ) => {
    const x = emphasize(source, hopSeconds);
    const acf = new Float64Array(maxLag * 4 + 2);
    for (let lag = minLag; lag < acf.length && lag < x.length / 2; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < x.length; i++) sum += x[i] * x[i + lag];
      acf[lag] = sum / (x.length - lag);
    }
    const top = acf.reduce((m, v) => Math.max(m, v), 0);
    return top > 0 ? acf.map((v) => v / top) : acf;
  };
  // The whole spectrum says where the rhythm is; the bass says where the beat is (hats between the beats would otherwise double the tempo).
  const whole = autocorrelation(flux);
  const bass = low ? autocorrelation(low) : null;
  const acf = whole.map((v, i) => v + (bass ? 1.5 * bass[i] : 0));
  // A beat period is also a period at two and four times its length, so those add to its score.
  const score = new Float64Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * hopSeconds);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.8) ** 2);
    score[lag] = (acf[lag] + 0.5 * acf[lag * 2] + 0.25 * acf[lag * 4]) * (0.5 + 0.5 * prior);
    best = Math.max(best, score[lag]);
  }
  if (best <= 0) return [];
  const peaks                                   = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (score[lag] > score[lag - 1] && score[lag] >= score[lag + 1] && score[lag] > 0.15 * best) peaks.push({ lag, value: score[lag] });
  }
  peaks.sort((a, b) => b.value - a.value);
  const chosen               = [];
  for (const { lag, value } of peaks) {
    // Parabolic interpolation puts the peak between lags.
    const a = score[lag - 1];
    const b = score[lag];
    const c = score[lag + 1];
    const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
    const bpm = 60 / ((lag + shift) * hopSeconds);
    if (chosen.some((g) => Math.abs(g.bpm - bpm) / bpm < 0.03)) continue;
    chosen.push({ bpm, confidence: value / best });
    if (chosen.length >= 4) break;
  }
  return chosen;
}

/**
 * How well a tempo makes the music repeat: the bar-level loop of a beat (a pattern of 3-3-2 kicks reads as triplets at two thirds of the real tempo) comes
 * back after 4, 8 or 16 whole beats, so the real tempo has the strongest self-similarity at those lags. 0..1.
 */
function loopFit(onsets        , bpm        )         {
  const peak = (v              ) => v.reduce((m, q) => Math.max(m, q), 0) || 1;
  const flux = emphasize(onsets.flux, onsets.hopSeconds);
  const low = emphasize(onsets.low, onsets.hopSeconds);
  const fluxPeak = peak(flux);
  const lowPeak = peak(low);
  const x = flux.map((v, i) => v / fluxPeak + (1.5 * low[i]) / lowPeak);
  const correlation = (lag        ) => {
    const whole = Math.floor(lag);
    const frac = lag - whole;
    let sum = 0;
    for (let i = 0; i + whole + 1 < x.length; i++) sum += x[i] * (x[i + whole] * (1 - frac) + x[i + whole + 1] * frac);
    return sum / (x.length - whole);
  };
  const zero = correlation(0);
  const beat = 60 / bpm / onsets.hopSeconds;
  const lags = [4, 8, 16].filter((k) => k * beat < x.length / 2);
  if (zero <= 0 || lags.length === 0) return 0;
  return lags.reduce((s, k) => s + correlation(k * beat) / zero, 0) / lags.length;
}

/**
 * The tempo to use among the likely ones: the best-scored one, unless another that is almost as clear makes the music repeat clearly better (the
 * best-scored one then cuts the pattern at a length that is not a whole number of beats).
 */
function chooseTempo(onsets        , candidates              )             {
  const fits = candidates.map((c) => ({ c, fit: c.confidence >= 0.6 ? loopFit(onsets, c.bpm) : 0 }));
  const top = fits[0];
  const better = fits.filter((f) => f.fit > 1.3 * top.fit && f.fit > 0.1);
  const best = better.length === 0 ? top.c : better.sort((a, b) => b.fit - a.fit)[0].c;
  // A tempo picked for its repeat can be half of the usual one: a slow pick with a clear double that is a usual tempo is taken at the double.
  const double = candidates.find((c) => c.confidence >= 0.6 && Math.abs(c.bpm / best.bpm - 2) < 0.06 && c.bpm <= 160);
  return better.length > 0 && best.bpm < 80 && double ? double : best;
}

/** A value read between frames. */
function at(x              , position        )         {
  const i = Math.floor(position);
  if (i < 0 || i + 1 >= x.length) return 0;
  const f = position - i;
  return x[i] * (1 - f) + x[i + 1] * f;
}

                           
                                                                                  
                        
                                                                                  
                        
                                                                           
                   
 

/**
 * Lays a beat grid over the onsets: the best phase for the first guess of the tempo, then a straight-line fit through the
 * onset nearest every predicted beat, so a tempo that is a fraction of a BPM out is corrected by hundreds of beats of evidence.
 */
function fitBeatGrid(onsets        , bpm        )                  {
  // Normalize the bands separately so loud offbeat hats cannot drown out the kick.
  const whole = emphasize(onsets.flux, onsets.hopSeconds);
  const bass = emphasize(onsets.low, onsets.hopSeconds);
  const wholePeak = whole.reduce((m, v) => Math.max(m, v), 0) || 1;
  const bassPeak = bass.reduce((m, v) => Math.max(m, v), 0);
  const x = whole.map((v, i) => v / wholePeak + (bassPeak > 0 ? 2.5 * bass[i] / bassPeak : 0));
  if (x.length < 8) return null;
  let period = 60 / bpm / onsets.hopSeconds; // frames
  let origin = 0;
  let bestScore = -1;
  for (let phase = 0; phase < period; phase += 0.5) {
    let sum = 0;
    for (let p = phase; p < x.length - 1; p += period) sum += at(x, p);
    if (sum > bestScore) {
      bestScore = sum;
      origin = phase;
    }
  }
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  let coverage = 0;
  for (let pass = 0; pass < 4; pass++) {
    const found                                                 = [];
    const radius = Math.max(1, Math.round(0.12 * period));
    const beats = Math.floor((x.length - 1 - origin) / period);
    for (let k = 0; k <= beats; k++) {
      const predicted = origin + k * period;
      let peak = -1;
      let peakFrame = -1;
      for (let i = Math.max(1, Math.round(predicted) - radius); i <= Math.min(x.length - 2, Math.round(predicted) + radius); i++) {
        if (x[i] > peak) {
          peak = x[i];
          peakFrame = i;
        }
      }
      if (peakFrame < 0 || peak < 1.5 * mean) continue;
      // Parabolic interpolation for a position between frames.
      const a = x[peakFrame - 1];
      const b = x[peakFrame];
      const c = x[peakFrame + 1];
      const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
      found.push({ k, frame: peakFrame + Math.max(-0.5, Math.min(0.5, shift)), weight: peak });
    }
    if (found.length < 4) return null;
    coverage = found.length / (beats + 1);
    // Weighted straight line through (k, frame), dropping the worst misses on the later passes.
    let use = found;
    for (let round = 0; round < 2; round++) {
      let sw = 0;
      let sk = 0;
      let sf = 0;
      let skk = 0;
      let skf = 0;
      for (const p of use) {
        sw += p.weight;
        sk += p.weight * p.k;
        sf += p.weight * p.frame;
        skk += p.weight * p.k * p.k;
        skf += p.weight * p.k * p.frame;
      }
      const denominator = sw * skk - sk * sk;
      if (denominator === 0) return null;
      period = (sw * skf - sk * sf) / denominator;
      origin = (sf - period * sk) / sw;
      use = found.filter((p) => Math.abs(p.frame - (origin + p.k * period)) < 0.05 * period);
      if (use.length < 4) return null;
    }
  }
  return {
    periodSeconds: period * onsets.hopSeconds,
    originSeconds: origin * onsets.hopSeconds + onsets.frameOffsetSeconds,
    coverage,
  };
}

                           
                                                                   
                
                                                                              
                     
                                                                                                                                     
                 
 

/** How hard the bass (`low`) and the rest of the sound (`all`) hit on every beat of the grid, from the last beat before 0 that is still in the music's first moments. */
function beatStrengths(onsets        , grid          )                                            {
  const lowAll = emphasize(onsets.low, onsets.hopSeconds);
  const fluxAll = emphasize(onsets.flux, onsets.hopSeconds);
  const first = Math.ceil((-0.3 * grid.periodSeconds - grid.originSeconds) / grid.periodSeconds);
  const beats = Math.floor((onsets.flux.length * onsets.hopSeconds - grid.originSeconds) / grid.periodSeconds);
  const out                                            = [];
  for (let k = first; k <= beats; k++) {
    const frame = (grid.originSeconds - onsets.frameOffsetSeconds + k * grid.periodSeconds) / onsets.hopSeconds;
    // The strongest frame within a few around the beat, so a little timing slack does not lose the hit.
    let low = 0;
    let all = 0;
    for (let d = -2; d <= 2; d++) {
      low = Math.max(low, at(lowAll, frame + d));
      all = Math.max(all, at(fluxAll, frame + d));
    }
    out.push({ k, low, all });
  }
  return out;
}

/**
 * The first beat (its number on the grid, which may be -1 for a hit at the very start) that is a big bass hit: most of the way up to a strong kick of the
 * song. Producers put the first big kick on the 1. Null when the song has no bass hits to speak of.
 */
function firstBigBeat(onsets        , grid          , allowed                         )                {
  const beats = beatStrengths(onsets, grid);
  const sorted = beats.map((b) => b.low).sort((x, y) => x - y);
  const strong = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const hit = strong > 0 ? beats.find((b) => b.low >= 0.6 * strong && (!allowed || allowed(b.k))) : undefined;
  return hit ? hit.k : null;
}

/** Which of the `beatsPerBar` beats is beat 1: the one the bass lands on hardest. */
function pickDownbeat(onsets        , grid          , beatsPerBar        )           {
  const sums = new Float64Array(beatsPerBar);
  const counts = new Float64Array(beatsPerBar);
  for (const { k, low, all } of beatStrengths(onsets, grid)) {
    if (k < 0) continue;
    sums[k % beatsPerBar] += low + 0.15 * all; // loud hats on the 2 and 4 must not outweigh the bass
    counts[k % beatsPerBar]++;
  }
  const means = Array.from(sums, (s, i) => (counts[i] ? s / counts[i] : 0));
  const order = means.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const best = order[0];
  const second = order[1] ?? { v: 0 };
  const near = order.filter((o) => o.v >= 0.9 * best.v).map((o) => o.i);
  return { phase: best.i, near, confidence: best.v > 0 ? Math.max(0, Math.min(1, (best.v - second.v) / best.v)) : 0 };
}

/**
 * Where bar 1 goes: the first bar line (from the grid and the beat found to open the bar) whose downbeat is a big peak, at least half as strong as the
 * song's typical downbeat (or the first bar line when the music is already playing at the start). Intros are made of small, soft onsets that the first loud-ish frame would mistake for the start. Seconds from the start of the file.
 */
function firstBigBar(onsets        , grid          , phase        , beatsPerBar        , playingAtStart = false)         {
  const lowAll = emphasize(onsets.low, onsets.hopSeconds);
  const fluxAll = emphasize(onsets.flux, onsets.hopSeconds);
  const bar = grid.periodSeconds * beatsPerBar;
  const origin = grid.originSeconds + phase * grid.periodSeconds;
  const end = onsets.flux.length * onsets.hopSeconds;
  const first = Math.ceil((-0.3 * grid.periodSeconds - origin) / bar);
  const last = Math.floor((end - origin) / bar);
  const strengths           = [];
  for (let b = first; b <= last; b++) {
    const frame = (origin + b * bar - onsets.frameOffsetSeconds) / onsets.hopSeconds;
    let low = 0;
    let all = 0;
    for (let d = -2; d <= 2; d++) {
      low = Math.max(low, at(lowAll, frame + d));
      all = Math.max(all, at(fluxAll, frame + d));
    }
    strengths.push(low + 0.5 * all);
  }
  const typical = [...strengths].sort((a, b) => a - b)[Math.floor(strengths.length / 2)] ?? 0;
  // A file that opens on music already playing (cut from a longer loop) has its bar 1 at its start, however soft that bar line's own onset is.
  const index = playingAtStart ? 0 : typical > 0 ? strengths.findIndex((v) => v >= 0.5 * typical) : -1;
  return origin + (first + Math.max(0, index)) * bar;
}

/**
 * Moves a position onto the sound's real attack. The beat grid is accurate to a few milliseconds, but the first sample of
 * a kick is what a cut should land on. Looks within `radius` frames of `center` for the sharpest rise in loudness.
 */
function snapToAttack(mono              , center        , radius        , minContrast = 0)         {
  const smooth = 8;
  let best = -Infinity;
  let at = Math.round(center);
  let level = 0;
  const from = Math.max(smooth, Math.round(center) - radius);
  const to = Math.min(mono.length - smooth - 1, Math.round(center) + radius);
  for (let i = from; i <= to; i++) {
    let before = 0;
    let after = 0;
    for (let j = 1; j <= smooth; j++) {
      before += Math.abs(mono[i - j]);
      after += Math.abs(mono[i + j - 1]);
    }
    const rise = after - before;
    level += after;
    if (rise > best) {
      best = rise;
      at = i;
    }
  }
  // With a contrast asked for, a rise that is no bigger than the window's own level is noise or a swell, not an attack: stay where the caller pointed.
  const count = Math.max(1, to - from + 1);
  if (minContrast > 0 && best < minContrast * (level / count)) return Math.round(center);
  return at;
}

                           
                                     
             
                 
                                                               
                     
 

// Krumhansl-Kessler key profiles: how much each note belongs in a major or a minor key, from the tonic up.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a                   , b                   )         {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** How much of each of the twelve notes the song holds, over the whole song, corrected for a song that is tuned off A=440. */
function chromaOf(x              , rate        )               {
  const size = 4096;
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const first = Math.ceil(65 / (rate / size));
  const last = Math.floor(2000 / (rate / size));
  const spectrum = new Float64Array(size / 2);
  const total = new Float64Array(size / 2);
  for (let start = 0; start + size <= x.length; start += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = x[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let frameMax = 0;
    for (let k = Math.max(1, first - 12); k <= Math.min(size / 2 - 1, last + 12); k++) {
      spectrum[k] = Math.hypot(re[k], im[k]);
      if (k >= first && k <= last) frameMax = Math.max(frameMax, spectrum[k]);
    }
    if (frameMax <= 0) continue;
    // Each frame counts by its own loudness only a little, so a quiet verse weighs about as much as a loud chorus.
    for (let k = first; k <= last; k++) {
      // Only peaks that stand well above the bins around them are notes: noise (hats, the body of a snare) has peaks everywhere, but none that rise like a held note.
      if (!(spectrum[k] > spectrum[k - 1] && spectrum[k] >= spectrum[k + 1])) continue;
      let around = 0;
      let count = 0;
      for (let j = Math.max(1, k - 12); j <= Math.min(size / 2 - 1, k + 12); j++) {
        if (Math.abs(j - k) <= 2) continue;
        around += spectrum[j];
        count++;
      }
      if (spectrum[k] > PEAK_PROMINENCE * (around / count)) total[k] += Math.sqrt(spectrum[k] / frameMax);
    }
  }
  const binHz = rate / size;
  // The song's tuning: the weighted average distance of its peaks from the nearest note of A=440.
  let sx = 0;
  let sy = 0;
  for (let k = first; k <= last; k++) {
    if (!total[k]) continue;
    const midi = 69 + 12 * Math.log2((k * binHz) / 440);
    const angle = 2 * Math.PI * (midi - Math.round(midi));
    sx += total[k] * Math.cos(angle);
    sy += total[k] * Math.sin(angle);
  }
  const detune = Math.atan2(sy, sx) / (2 * Math.PI);
  const chroma = new Float64Array(12);
  for (let k = first; k <= last; k++) {
    if (!total[k]) continue;
    const midi = 69 + 12 * Math.log2((k * binHz) / 440) - detune;
    chroma[((Math.round(midi) % 12) + 12) % 12] += total[k];
  }
  return chroma;
}

/** The likeliest key, from a song's chroma (index 0 = C). */
function keyOfChroma(chroma                   )           {
  const scores                                                  = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = (profile          ) => profile.map((_, i) => profile[(i - tonic + 12) % 12]);
    scores.push({ pc: tonic, minor: false, value: correlation(chroma, rotated(MAJOR)) });
    scores.push({ pc: tonic, minor: true, value: correlation(chroma, rotated(MINOR)) });
  }
  scores.sort((a, b) => b.value - a.value);
  const best = scores[0];
  // The relative major or minor shares all its notes, so it is no real rival: compare with the best key that is neither.
  const relativePc = best.minor ? (best.pc + 3) % 12 : (best.pc + 9) % 12;
  const rival = scores.find((s) => !(s.pc === best.pc && s.minor === best.minor) && !(s.pc === relativePc && s.minor !== best.minor)) ?? scores[1];
  return { pc: best.pc, minor: best.minor, confidence: Math.max(0, Math.min(1, (best.value - rival.value) / Math.max(0.01, Math.abs(best.value)))) };
}

                               
              
                                                            
                              
                                                                                          
                          
                                                                             
                                                                             
                
 

/** Whether the file opens on music at close to its usual loudness (not a fade-in or a quiet intro): the first quarter second against the median quarter second. */
function playingAtStart(mono              , sampleRate        )          {
  const size = Math.round(0.25 * sampleRate);
  const blocks = Math.floor(mono.length / size);
  if (blocks < 8) return false;
  const rms = Array.from({ length: blocks }, (_, b) => {
    let sum = 0;
    for (let i = b * size; i < (b + 1) * size; i++) sum += mono[i] * mono[i];
    return Math.sqrt(sum / size);
  });
  const median = [...rms].sort((a, b) => a - b)[Math.floor(blocks / 2)];
  return median > 0 && rms[0] >= 0.5 * median;
}

/** Tempo, bar 1 and key of a song, from its mono mix. Null when no beat could be found. */
function analyzeSong(mono              , sampleRate        , beatsPerBar        )                      {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  const x = decimate(mono, factor);
  const rate = sampleRate / factor;
  const onsets = onsetStrength(x, rate);
  const candidates = tempoCandidates(onsets.flux, onsets.hopSeconds, onsets.low);
  if (!candidates.length) return null;
  const tempo = chooseTempo(onsets, candidates);
  const grid = fitBeatGrid(onsets, tempo.bpm);
  if (!grid) return null;
  const downbeat = pickDownbeat(onsets, grid, beatsPerBar);

  // The first bar line whose downbeat is a big hit, so a quiet intro of pads, risers or ghost notes does not count as where the music starts.
  // When the bass does not clearly favour one beat (a syncopated kick pattern ties two), the first big hit of the song is taken as the 1.
  const initialFrames = Math.min(onsets.low.length, Math.ceil(0.03 / onsets.hopSeconds));
  const initialBass = onsets.low.subarray(0, initialFrames).reduce((m, v) => Math.max(m, v), 0);
  const bassHits = Array.from(onsets.low).filter((v) => v > 0).sort((a, b) => a - b);
  const strongBass = bassHits[Math.floor(bassHits.length * 0.95)] ?? 0;
  const boundaryBeat = Math.round(-grid.originSeconds / grid.periodSeconds);
  const boundaryTime = grid.originSeconds + boundaryBeat * grid.periodSeconds;
  // File-start evidence is useful only when a bass attack and the fitted beat agree.
  const boundaryHit = Math.abs(boundaryTime) < 0.03 && strongBass > 0 && initialBass >= 0.3 * strongBass;
  const first = boundaryHit ? boundaryBeat : downbeat.confidence < 0.5 ? firstBigBeat(onsets, grid, (k) => downbeat.near.includes(((k % beatsPerBar) + beatsPerBar) % beatsPerBar)) : null;
  const phase = first === null ? downbeat.phase : ((first % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const rough = firstBigBar(onsets, grid, phase, beatsPerBar, playingAtStart(mono, sampleRate));
  let snapped = snapToAttack(mono, rough * sampleRate, Math.round(0.03 * sampleRate)) / sampleRate;
  if (boundaryHit && Math.abs(rough) < 0.03) {
    // Keep genuine leading silence; do not turn a start-of-file preference into a zero snap.
    const end = Math.min(mono.length, Math.ceil(0.03 * sampleRate));
    let peak = 0;
    for (let i = 0; i < end; i++) peak = Math.max(peak, Math.abs(mono[i]));
    let attack = 0;
    while (attack < end && Math.abs(mono[attack]) < peak * 0.05) attack++;
    snapped = attack / sampleRate;
  }

  const key = keyOfChroma(chromaOf(x, rate));
  const bpm = 60 / grid.periodSeconds;
  return {
    bpm,
    tempoAlternatives: [bpm / 2, bpm * 2].filter((b) => b >= 40 && b <= 240),
    downbeatSeconds: snapped,
    confidence: { tempo: tempo.confidence, grid: grid.coverage, downbeat: downbeat.confidence, key: key.confidence },
    key,
  };
}


return analyzeSong;
})();
// Grid drift correction. The detected tempo is a fraction of a BPM out, and a song that was not played to a click wanders, so a grid laid from the first
// downbeat slides off the hits it should sit on. The transient on the grid's first downbeat is taken as a template; the beats after it are searched for
// hits that look like it (normalised cross-correlation), following the hits as they drift. A straight line through the matches gives the exact tempo, and
// wherever the grid is more than `percent` of a beat from a confirmed match it is re-locked there (a new tempo segment, same tempo).
// Pure arithmetic on the mono audio so it can run in the worker and be tested.

/** A grid line further than this share of a beat (percent) from a confirmed hit is moved onto the hit. */
const DRIFT_PERCENT = 2;
/** How alike a hit must be to the first downbeat's transient (0 to 1) to count as the same sound. */
const MIN_SIMILARITY = 0.6;
/** The template: this long from just before the attack. */
const TEMPLATE_S = 0.04;
const PRE_S = 0.003;
/** How far either side of where a hit is expected to look, as a share of a beat. */
const SEARCH = 0.15;
/** The tempo the hits give never strays further than this from the grid's (ratio). */
const MAX_TEMPO_CHANGE = 0.05;
/** The coarse search runs on audio decimated to about this rate. */
const COARSE_RATE = 5512;
/** Matches the running tempo estimate is taken from. */
const RECENT = 12;

                           
                
                                                                       
                  
                                                                  
                  
 

               
            
                
 

/** Block-averaged copy of `x` at 1/`factor` of the rate. */
function decimate(x              , factor        )               {
  if (factor <= 1) return x;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += x[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

/** Zero-mean copy of `x[from, from+length)` and its norm. */
function templateOf(x              , from        , length        )                                    {
  const t = new Float32Array(length);
  let mean = 0;
  for (let i = 0; i < length; i++) mean += x[from + i];
  mean /= length;
  let energy = 0;
  for (let i = 0; i < length; i++) {
    t[i] = x[from + i] - mean;
    energy += t[i] * t[i];
  }
  return { t, norm: Math.sqrt(energy) };
}

/**
 * The grid with its tempo and phase corrected from the hits that sound like the one on its first downbeat. Returns the grid itself (and 0 matches) when the
 * first downbeat has no clear transient or fewer than four hits match.
 */
function correctDrift(mono              , grid         , percent = DRIFT_PERCENT)           {
  const none           = { grid, matches: 0, relocks: 0 };
  const rate = grid.sampleRate;
  const beat = grid.segments[0].beatFrames;
  const first = Math.round(grid.segments[0].frame);
  const startFull = first - Math.round(PRE_S * rate);
  const lengthFull = Math.round(TEMPLATE_S * rate);
  if (startFull < 0 || startFull + lengthFull >= mono.length || beat < 16) return none;

  const factor = Math.max(1, Math.floor(rate / COARSE_RATE));
  const coarse = decimate(mono, factor);
  const startCoarse = Math.round(startFull / factor);
  const lengthCoarse = Math.max(8, Math.round(lengthFull / factor));
  if (startCoarse + lengthCoarse >= coarse.length) return none;
  const coarseT = templateOf(coarse, startCoarse, lengthCoarse);
  const fullT = templateOf(mono, startFull, lengthFull);
  if (coarseT.norm < 1e-6 || fullT.norm < 1e-6) return none;

  // Running sums so the energy and mean of any window of the coarse audio cost nothing.
  const sum1 = new Float64Array(coarse.length + 1);
  const sum2 = new Float64Array(coarse.length + 1);
  for (let i = 0; i < coarse.length; i++) {
    sum1[i + 1] = sum1[i] + coarse[i];
    sum2[i + 1] = sum2[i] + coarse[i] * coarse[i];
  }
  const coarseScore = (p        )         => {
    let dot = 0;
    for (let i = 0; i < lengthCoarse; i++) dot += coarseT.t[i] * coarse[p + i];
    const s1 = sum1[p + lengthCoarse] - sum1[p];
    const s2 = sum2[p + lengthCoarse] - sum2[p];
    const energy = s2 - (s1 * s1) / lengthCoarse;
    return energy <= 1e-12 ? 0 : dot / (coarseT.norm * Math.sqrt(energy));
  };
  const fullScore = (p        )         => {
    let dot = 0;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < lengthFull; i++) {
      const v = mono[p + i];
      dot += fullT.t[i] * v;
      s1 += v;
      s2 += v * v;
    }
    const energy = s2 - (s1 * s1) / lengthFull;
    return energy <= 1e-12 ? 0 : dot / (fullT.norm * Math.sqrt(energy));
  };

  /** The frame of the attack of the best match for the template around `expected` (a frame), or null when nothing there is alike enough. */
  const find = (expected        , radius        )                => {
    const lo = Math.max(0, Math.round((expected - radius - (first - startFull)) / factor));
    const hi = Math.min(coarse.length - lengthCoarse - 1, Math.round((expected + radius - (first - startFull)) / factor));
    let best = -Infinity;
    let bestP = -1;
    for (let p = lo; p <= hi; p++) {
      const s = coarseScore(p);
      if (s > best) {
        best = s;
        bestP = p;
      }
    }
    if (bestP < 0 || best < MIN_SIMILARITY) return null;
    // Refine on the full-rate audio, then to a fraction of a frame by the parabola through the peak.
    const centre = bestP * factor;
    const from = Math.max(0, centre - 2 * factor);
    const to = Math.min(mono.length - lengthFull - 1, centre + 2 * factor);
    let top = -Infinity;
    let topP = -1;
    const scores = new Map                ();
    for (let p = from; p <= to; p++) {
      const s = fullScore(p);
      scores.set(p, s);
      if (s > top) {
        top = s;
        topP = p;
      }
    }
    if (topP < 0) return null;
    const a = scores.get(topP - 1);
    const c = scores.get(topP + 1);
    let shift = 0;
    if (a !== undefined && c !== undefined && a - 2 * top + c < 0) shift = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / (a - 2 * top + c)));
    return topP + shift + (first - startFull);
  };

  // Follow the hits forward from the first downbeat: each search is centred where the last match and the running tempo say the next one is.
  const hits        = [{ k: 0, frame: first }];
  const recent        = [hits[0]];
  let estimate = beat;
  let last = hits[0];
  for (let k = 1; ; k++) {
    const expected = last.frame + (k - last.k) * estimate;
    if (expected + SEARCH * estimate + lengthFull >= mono.length) break;
    const frame = find(expected, SEARCH * estimate);
    if (frame === null) continue;
    last = { k, frame };
    hits.push(last);
    recent.push(last);
    if (recent.length > RECENT) recent.shift();
    if (recent.length >= 3) {
      // Slope of the recent hits against their line numbers.
      const n = recent.length;
      const mk = recent.reduce((t, h) => t + h.k, 0) / n;
      const mf = recent.reduce((t, h) => t + h.frame, 0) / n;
      const slope = recent.reduce((t, h) => t + (h.k - mk) * (h.frame - mf), 0) / recent.reduce((t, h) => t + (h.k - mk) ** 2, 0);
      estimate = Math.min(beat * (1 + MAX_TEMPO_CHANGE), Math.max(beat * (1 - MAX_TEMPO_CHANGE), slope));
    }
  }
  if (hits.length < 4) return none;

  // The tempo: the slope through the first downbeat (which stays where it is), dropping the hits that sit far off the line.
  let use = hits.slice(1);
  let fitted = beat;
  for (let round = 0; round < 3; round++) {
    const top = use.reduce((t, h) => t + h.k * (h.frame - first), 0);
    const bottom = use.reduce((t, h) => t + h.k * h.k, 0);
    if (bottom === 0) return none;
    fitted = top / bottom;
    const kept = hits.slice(1).filter((h) => Math.abs(h.frame - (first + h.k * fitted)) < (round === 0 ? 0.25 : 0.1) * beat);
    if (kept.length < 3) break;
    use = kept;
  }
  fitted = Math.min(beat * (1 + MAX_TEMPO_CHANGE), Math.max(beat * (1 - MAX_TEMPO_CHANGE), fitted));

  // Where the grid has drifted past the limit from a hit (confirmed by the next one the same way), it is put back on the hit.
  const limit = (percent / 100) * fitted;
  const segments                 = [{ line: 0, frame: first, beatFrames: fitted }];
  let at = segments[0];
  const errorOf = (h     ) => h.frame - (at.frame + (h.k - at.line) * fitted);
  for (let i = 1; i < hits.length - 1; i++) {
    const e = errorOf(hits[i]);
    if (Math.abs(e) <= limit) continue;
    const next = errorOf(hits[i + 1]);
    if (Math.abs(next) <= limit || Math.sign(next) !== Math.sign(e)) continue;
    at = { line: hits[i].k, frame: hits[i].frame, beatFrames: fitted };
    segments.push(at);
  }
  return { grid: { ...grid, segments }, matches: hits.length, relocks: segments.length - 1 };
}




const analyze = (channelData              , sampleRate        , tempoSettings                 ) => {
    const tempoBuckets = computeTempoBuckets(channelData, sampleRate, tempoSettings);

    if (tempoBuckets.length === 0) {
        throw new Error('The given channelData does not contain any detectable beats.');
    }

    return tempoBuckets[0].tempo;
};







const MINUMUM_NUMBER_OF_PEAKS = 30;

const computeTempoBuckets = (channelData              , sampleRate        , tempoSettings                 )                 => {
    const maximumValue = getMaximumValue(channelData);
    const minimumThreshold = maximumValue * 0.3;

    let peaks           = [];
    let threshold = maximumValue - maximumValue * 0.05;

    if (maximumValue > 0.25) {
        while (peaks.length < MINUMUM_NUMBER_OF_PEAKS && threshold >= minimumThreshold) {
            peaks = getPeaksAtThreshold(channelData, threshold, sampleRate);
            threshold -= maximumValue * 0.05;
        }
    }

    const intervalBuckets = countIntervalsBetweenNearbyPeaks(peaks);
    const tempoBuckets = groupNeighborsByTempo(intervalBuckets, sampleRate, tempoSettings);

    tempoBuckets.sort((a, b) => b.score - a.score);

    return tempoBuckets;
};



const countIntervalsBetweenNearbyPeaks = (peaks          ) => {
    const intervalBuckets                    = [];

    peaks.forEach((peak, index) => {
        const length = Math.min(peaks.length - index, 10);

        for (let i = 1; i < length; i += 1) {
            const interval = peaks[index + i] - peak;

            const foundInterval = intervalBuckets.some((intervalBucket) => {
                if (intervalBucket.interval === interval) {
                    intervalBucket.peaks.push(peak);

                    return true;
                }

                return false;
            });

            if (!foundInterval) {
                intervalBuckets.push({
                    interval,
                    peaks: [peak]
                });
            }
        }
    });

    return intervalBuckets;
};


const getMaximumValue = (channelData              )         => {
    let maximumValue = 0;

    const length = channelData.length;

    for (let i = 0; i < length; i += 1) {
        if (channelData[i] > maximumValue) {
            maximumValue = channelData[i];
        }
    }

    return maximumValue;
};


const getPeaksAtThreshold = (channelData              , threshold        , sampleRate        ) => {
    const length = channelData.length;
    const peaks = [];

    let lastValueWasAboveThreshold = false;

    for (let i = 0; i < length; i += 1) {
        if (channelData[i] > threshold) {
            lastValueWasAboveThreshold = true;
        } else if (lastValueWasAboveThreshold) {
            lastValueWasAboveThreshold = false;
            peaks.push(i - 1);

            // Skip 0.25 seconds forward to get past this peak.
            i += sampleRate / 4 - 1;
        }
    }

    // Add the last value in the unlikely case it was peak.
    if (lastValueWasAboveThreshold) {
        peaks.push(length - 1);
    }

    return peaks;
};



const groupNeighborsByTempo = (intervalBuckets                   , sampleRate        , tempoSettings                 = {}) => {
    const maxTempo = Math.max(0, tempoSettings.maxTempo ?? 180);
    const minTempo = Math.max(0, tempoSettings.minTempo ?? 90);
    const tempoBuckets                 = [];

    intervalBuckets.forEach((intervalBucket) => {
        // Convert an interval to a tempo (aka BPM).
        let theoreticalTempo = 60 / (intervalBucket.interval / sampleRate);

        while (theoreticalTempo < minTempo) {
            theoreticalTempo *= 2;
        }

        while (theoreticalTempo > maxTempo) {
            theoreticalTempo /= 2;
        }

        if (theoreticalTempo < minTempo) {
            return;
        }

        let foundTempo = false;
        let score = intervalBucket.peaks.length;

        tempoBuckets.forEach((tempoBucket) => {
            if (tempoBucket.tempo === theoreticalTempo) {
                tempoBucket.score += intervalBucket.peaks.length;
                tempoBucket.peaks = [...tempoBucket.peaks, ...intervalBucket.peaks];

                foundTempo = true;
            }

            if (tempoBucket.tempo > theoreticalTempo - 0.5 && tempoBucket.tempo < theoreticalTempo + 0.5) {
                const tempoDifference = Math.abs(tempoBucket.tempo - theoreticalTempo) * 2;

                score += (1 - tempoDifference) * tempoBucket.peaks.length;
                tempoBucket.score += (1 - tempoDifference) * intervalBucket.peaks.length;
            }
        });

        if (!foundTempo) {
            tempoBuckets.push({
                peaks: intervalBucket.peaks,
                score,
                tempo: theoreticalTempo
            });
        }
    });

    return tempoBuckets;
};




const guess = (channelData              , sampleRate        , tempoSettings                 ) => {
    const tempoBuckets = computeTempoBuckets(channelData, sampleRate, tempoSettings);

    if (tempoBuckets.length === 0) {
        throw new Error('The given channelData does not contain any detectable beats.');
    }

    const { peaks, tempo } = tempoBuckets[0];
    const bpm = Math.round(tempo);
    const secondsPerBeat = 60 / bpm;

    peaks.sort((a, b) => a - b);

    let offset = peaks[0] / sampleRate;

    while (offset > secondsPerBeat) {
        offset -= secondsPerBeat;
    }

    return {
        bpm,
        offset,
        tempo
    };
};


(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["module", "exports"], factory);
    } else if (typeof exports !== "undefined") {
        factory(module, exports);
    } else {
        var mod = {
            exports: {}
        };
        factory(mod, mod.exports);
        global.FFT = mod.exports;
    }
})(this, function (module, exports) {
    "use strict";

    Object.defineProperty(exports, "__esModule", {
        value: true
    });

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    var _createClass = function () {
        function defineProperties(target, props) {
            for (var i = 0; i < props.length; i++) {
                var descriptor = props[i];
                descriptor.enumerable = descriptor.enumerable || false;
                descriptor.configurable = true;
                if ("value" in descriptor) descriptor.writable = true;
                Object.defineProperty(target, descriptor.key, descriptor);
            }
        }

        return function (Constructor, protoProps, staticProps) {
            if (protoProps) defineProperties(Constructor.prototype, protoProps);
            if (staticProps) defineProperties(Constructor, staticProps);
            return Constructor;
        };
    }();

    var FFT = function () {
        function FFT() {
            _classCallCheck(this, FFT);
        }

        _createClass(FFT, null, [{
            key: "getHammingWindow",
            value: function getHammingWindow(bufferSize) {
                var a = 25 / 46;
                var b = 21 / 46;
                var scale = 1 / bufferSize / 0.54;
                var sqrtBufferSize = Math.sqrt(bufferSize);
                var factor = Math.PI * 2 / bufferSize;
                var wnd = [];
                for (var i = 0; i < bufferSize; i++) {
                    wnd[i] = sqrtBufferSize * (scale * (a - b * Math.cos(factor * i)));
                }
                return wnd;
            }
        }, {
            key: "getSpectrum",
            value: function getSpectrum(re, im) {
                var direction = -1;
                var n = re.length;
                var bits = Math.round(Math.log(n) / Math.log(2));
                var twoPI = Math.PI * 2;
                if (n != 1 << bits) throw new Error("FFT data must be power of 2");
                var localN = void 0;
                var j = 0;
                for (var i = 0; i < n - 1; i++) {
                    if (i < j) {
                        var temp = re[j];
                        re[j] = re[i];
                        re[i] = temp;
                        temp = im[j];
                        im[j] = im[i];
                        im[i] = temp;
                    }
                    var k = n / 2;
                    while (k >= 1 && k - 1 < j) {
                        j = j - k;
                        k = k / 2;
                    }
                    j = j + k;
                }
                for (var m = 1; m <= bits; m++) {
                    localN = 1 << m;
                    var Wjk_r = 1;
                    var Wjk_i = 0;
                    var theta = twoPI / localN;
                    var Wj_r = Math.cos(theta);
                    var Wj_i = direction * Math.sin(theta);
                    var nby2 = localN / 2;
                    for (j = 0; j < nby2; j++) {
                        for (var _k = j; _k < n; _k += localN) {
                            var id = _k + nby2;
                            var tempr = Wjk_r * re[id] - Wjk_i * im[id];
                            var tempi = Wjk_r * im[id] + Wjk_i * re[id];
                            re[id] = re[_k] - tempr;
                            im[id] = im[_k] - tempi;
                            re[_k] += tempr;
                            im[_k] += tempi;
                        }
                        var wtemp = Wjk_r;
                        Wjk_r = Wj_r * Wjk_r - Wj_i * Wjk_i;
                        Wjk_i = Wj_r * Wjk_i + Wj_i * wtemp;
                    }
                }

                for (var _i = 0; _i < re.length; _i++) {
                    var pow = re[_i] * re[_i] + im[_i] * im[_i];
                    //im[i] = Math.atan2(im[i], re[i]);
                    re[_i] = pow;
                }

                for (var _i2 = 0; _i2 < re.length; _i2++) {
                    re[_i2] = Math.sqrt(re[_i2]);
                }
            }
        }]);

        return FFT;
    }();

    exports.default = FFT;
    module.exports = exports["default"];
});
(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["module", "exports"], factory);
    } else if (typeof exports !== "undefined") {
        factory(module, exports);
    } else {
        var mod = {
            exports: {}
        };
        factory(mod, mod.exports);
        global.OnsetDetection = mod.exports;
    }
})(this, function (module, exports) {
    "use strict";

    Object.defineProperty(exports, "__esModule", {
        value: true
    });

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    var _createClass = function () {
        function defineProperties(target, props) {
            for (var i = 0; i < props.length; i++) {
                var descriptor = props[i];
                descriptor.enumerable = descriptor.enumerable || false;
                descriptor.configurable = true;
                if ("value" in descriptor) descriptor.writable = true;
                Object.defineProperty(target, descriptor.key, descriptor);
            }
        }

        return function (Constructor, protoProps, staticProps) {
            if (protoProps) defineProperties(Constructor.prototype, protoProps);
            if (staticProps) defineProperties(Constructor, staticProps);
            return Constructor;
        };
    }();

    var OnsetDetection = function () {
        function OnsetDetection() {
            _classCallCheck(this, OnsetDetection);
        }

        _createClass(OnsetDetection, null, [{
            key: "calculateSF",
            value: function calculateSF(audioData, fft) {
                var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

                if (typeof fft == "undefined") {
                    throw new ReferenceError("fft is undefined");
                }
                if (typeof fft.getHammingWindow !== "function" || typeof fft.getSpectrum !== "function") {
                    throw new ReferenceError("fft doesn't contain getHammingWindow or getSpectrum methods");
                }
                // Array.fill polyfill
                if (!Array.prototype.fill) {
                    Array.prototype.fill = function (value) {
                        if (this == null) {
                            throw new TypeError('this is null or not defined');
                        }
                        var O = Object(this);
                        var len = O.length >>> 0;
                        var start = arguments[1];
                        var relativeStart = start >> 0;
                        var k = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);
                        var end = arguments[2];
                        var relativeEnd = end === undefined ? len : end >> 0;
                        var final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);
                        while (k < final) {
                            O[k] = value;
                            k++;
                        }
                        return O;
                    };
                }
                params.bufferSize = params.bufferSize || 2048;
                //params.samplingRate = params.samplingRate || 44100;
                params.hopSize = params.hopSize || 441;

                var bufferSize = params.bufferSize,
                    hopSize = params.hopSize;


                var k = Math.floor(Math.log(bufferSize) / Math.LN2);
                if (Math.pow(2, k) !== bufferSize) {
                    throw "Invalid buffer size (" + bufferSize + "), must be power of 2";
                }

                var hammWindow = fft.getHammingWindow(bufferSize);
                var spectralFlux = [];
                var spectrumLength = bufferSize / 2 + 1;
                var previousSpectrum = new Array(spectrumLength);
                previousSpectrum.fill(0);
                var im = new Array(bufferSize);

                var length = audioData.length;
                var zerosStart = new Array(bufferSize - hopSize);
                zerosStart.fill(0);
                audioData = zerosStart.concat(audioData);

                var zerosEnd = new Array(bufferSize - audioData.length % hopSize);
                zerosEnd.fill(0);
                audioData = audioData.concat(zerosEnd);

                for (var wndStart = 0; wndStart < length; wndStart += hopSize) {
                    var wndEnd = wndStart + bufferSize;

                    var re = [];
                    var _k = 0;
                    for (var i = wndStart; i < wndEnd; i++) {
                        re[_k] = hammWindow[_k] * audioData[i];
                        _k++;
                    }
                    im.fill(0);

                    fft.getSpectrum(re, im);

                    var flux = 0;
                    for (var j = 0; j < spectrumLength; j++) {
                        var value = re[j] - previousSpectrum[j];
                        flux += value < 0 ? 0 : value;
                    }
                    spectralFlux.push(flux);

                    previousSpectrum = re;
                }

                return spectralFlux;
            }
        }, {
            key: "normalize",
            value: function normalize(data) {
                if (!Array.isArray(data)) {
                    throw "Array expected";
                }
                if (data.length == 0) {
                    throw "Array is empty";
                }
                var sum = 0;
                var squareSum = 0;
                for (var i = 0; i < data.length; i++) {
                    sum += data[i];
                    squareSum += data[i] * data[i];
                }
                var mean = sum / data.length;
                var standardDeviation = Math.sqrt((squareSum - sum * mean) / data.length);
                if (standardDeviation == 0) standardDeviation = 1;
                for (var _i = 0; _i < data.length; _i++) {
                    data[_i] = (data[_i] - mean) / standardDeviation;
                }
            }
        }, {
            key: "findPeaks",
            value: function findPeaks(spectralFlux) {
                var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

                var length = spectralFlux.length;
                var sf = spectralFlux;
                var decayRate = params.decayRate || 0.84;
                var peakFindingWindow = params.peakFindingWindow || 6;
                var meanWndMultiplier = params.meanWndMultiplier || 3;
                var peakThreshold = params.peakThreshold || 0.35;

                var max = 0;
                var av = sf[0];
                var peaks = [];

                for (var i = 0; i < length; i++) {
                    av = decayRate * av + (1 - decayRate) * sf[i];
                    if (sf[i] < av) continue;

                    var wndStart = i - peakFindingWindow;
                    var wndEnd = i + peakFindingWindow + 1;

                    if (wndStart < 0) wndStart = 0;
                    if (wndEnd > length) wndEnd = length;
                    if (av < sf[i]) av = sf[i];

                    var isMax = true;
                    for (var j = wndStart; j < wndEnd; j++) {
                        if (sf[j] > sf[i]) isMax = false;
                    }
                    if (isMax) {
                        var meanWndStart = i - peakFindingWindow * meanWndMultiplier;
                        var meanWndEnd = i + peakFindingWindow;
                        if (meanWndStart < 0) meanWndStart = 0;
                        if (meanWndEnd > length) meanWndEnd = length;
                        var sum = 0;
                        var count = meanWndEnd - meanWndStart;
                        for (var _j = meanWndStart; _j < meanWndEnd; _j++) {
                            sum += sf[_j];
                        }
                        if (sf[i] > sum / count + peakThreshold) {
                            peaks.push(i);
                        }
                    }
                }

                if (peaks.length < 2) {
                    throw "Fail to find peaks";
                }
                return peaks;
            }
        }]);

        return OnsetDetection;
    }();

    exports.default = OnsetDetection;
    module.exports = exports["default"];
});
(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["module", "exports"], factory);
    } else if (typeof exports !== "undefined") {
        factory(module, exports);
    } else {
        var mod = {
            exports: {}
        };
        factory(mod, mod.exports);
        global.TempoInduction = mod.exports;
    }
})(this, function (module, exports) {
    "use strict";

    Object.defineProperty(exports, "__esModule", {
        value: true
    });

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    var _createClass = function () {
        function defineProperties(target, props) {
            for (var i = 0; i < props.length; i++) {
                var descriptor = props[i];
                descriptor.enumerable = descriptor.enumerable || false;
                descriptor.configurable = true;
                if ("value" in descriptor) descriptor.writable = true;
                Object.defineProperty(target, descriptor.key, descriptor);
            }
        }

        return function (Constructor, protoProps, staticProps) {
            if (protoProps) defineProperties(Constructor.prototype, protoProps);
            if (staticProps) defineProperties(Constructor, staticProps);
            return Constructor;
        };
    }();

    var TempoInduction = function () {
        function TempoInduction() {
            _classCallCheck(this, TempoInduction);
        }

        _createClass(TempoInduction, null, [{
            key: "processRhythmicEvents",
            value: function processRhythmicEvents(events) {
                var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

                var widthTreshold = params.widthTreshold || 0.025,
                    maxIOI = params.maxIOI || 2.5,
                    minIOI = params.minIOI || 0.07,
                    length = events.length;

                var clIntervals = [],
                    clSizes = [],
                    clCount = 0;

                for (var i = 0; i < length - 1; i++) {
                    for (var j = i + 1; j < length; j++) {
                        var ioi = events[j] - events[i];
                        if (ioi < minIOI) {
                            continue;
                        }
                        if (ioi > maxIOI) {
                            break;
                        }
                        var k = 0;
                        for (; k < clCount; k++) {
                            if (Math.abs(clIntervals[k] - ioi) < widthTreshold) {
                                if (Math.abs(clIntervals[k + 1] - ioi) < Math.abs(clIntervals[k] - ioi) && k < clCount - 1) {
                                    k++;
                                }
                                clIntervals[k] = (clIntervals[k] * clSizes[k] + ioi) / (clSizes[k] + 1);
                                clSizes[k]++;
                                break;
                            }
                        }
                        if (k != clCount) continue;
                        clCount++;
                        for (; k > 0 && clIntervals[k - 1] > ioi; k--) {
                            clIntervals[k] = clIntervals[k - 1];
                            clSizes[k] = clSizes[k - 1];
                        }
                        clIntervals[k] = ioi;
                        clSizes[k] = 1;
                    }
                }
                if (clCount == 0) {
                    throw "Fail to find IOIs";
                }
                clIntervals.length = clCount;
                clSizes.length = clCount;
                return { clIntervals: clIntervals, clSizes: clSizes };
            }
        }, {
            key: "mergeClusters",
            value: function mergeClusters(clusters) {
                var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

                var widthTreshold = params.widthTreshold || 0.025;

                var clIntervals = clusters.clIntervals,
                    clSizes = clusters.clSizes;
                var clCount = clIntervals.length;

                for (var i = 0; i < clCount; i++) {
                    for (var j = i + 1; j < clCount; j++) {
                        if (Math.abs(clIntervals[i] - clIntervals[j]) < widthTreshold) {
                            clIntervals[i] = (clIntervals[i] * clSizes[i] + clIntervals[j] * clSizes[j]) / (clSizes[i] + clSizes[j]);
                            clSizes[i] = clSizes[i] + clSizes[j];
                            --clCount;
                            for (var k = j + 1; k <= clCount; k++) {
                                clIntervals[k - 1] = clIntervals[k];
                                clSizes[k - 1] = clSizes[k];
                            }
                        }
                    }
                }clIntervals.length = clCount;
                clSizes.length = clCount;
                return { clIntervals: clIntervals, clSizes: clSizes };
            }
        }, {
            key: "calculateScore",
            value: function calculateScore(clusters) {
                var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

                var widthTreshold = params.widthTreshold || 0.025;
                var maxTempos = params.maxTempos || 10;

                var clIntervals = clusters.clIntervals,
                    clSizes = clusters.clSizes,
                    clScores = [],
                    clScoresIdxs = [];
                var clCount = clIntervals.length;

                for (var i = 0; i < clCount; i++) {
                    clScores[i] = 10 * clSizes[i];
                    clScoresIdxs[i] = { score: clScores[i], idx: i };
                }

                clScoresIdxs.sort(function (a, b) {
                    return b.score - a.score;
                });
                if (clScoresIdxs.length > maxTempos) {
                    for (var _i = maxTempos - 1; _i < clScoresIdxs.length - 1; _i++) {
                        if (clScoresIdxs[_i].score == clScoresIdxs[_i + 1].score) {
                            maxTempos++;
                        } else {
                            break;
                        }
                    }
                    clScoresIdxs.length = maxTempos;
                }

                clScoresIdxs = clScoresIdxs.map(function (a) {
                    return a.idx;
                });

                for (var _i2 = 0; _i2 < clCount; _i2++) {
                    for (var j = _i2 + 1; j < clCount; j++) {
                        var ratio = clIntervals[_i2] / clIntervals[j];
                        var isFraction = ratio < 1;
                        var d = void 0,
                            err = void 0;
                        d = isFraction ? Math.round(1 / ratio) : Math.round(ratio);
                        if (d < 2 || d > 8) continue;

                        if (isFraction) err = Math.abs(clIntervals[_i2] * d - clIntervals[j]);else err = Math.abs(clIntervals[_i2] - clIntervals[j] * d);
                        var errTreshold = isFraction ? widthTreshold : widthTreshold * d;
                        if (err >= errTreshold) continue;

                        d = d >= 5 ? 1 : 6 - d;
                        clScores[_i2] += d * clSizes[j];
                        clScores[j] += d * clSizes[_i2];
                    }
                }
                return { clScores: clScores, clScoresIdxs: clScoresIdxs };
            }
        }, {
            key: "createTempoList",
            value: function createTempoList(clusters) {
                var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

                var widthTreshold = params.widthTreshold || 0.025,
                    minBeatInterval = params.minBeatInterval || 0.3,
                    maxBeatInterval = params.maxBeatInterval || 1;
                var clIntervals = clusters.clIntervals,
                    clSizes = clusters.clSizes,
                    clScores = clusters.clScores,
                    clScoresIdxs = clusters.clScoresIdxs,
                    tempoList = [];
                var clCount = clIntervals.length;

                for (var i = 0; i < clScoresIdxs.length; i++) {
                    var idx = clScoresIdxs[i];
                    var newSum = clIntervals[idx] * clScores[idx];
                    var newWeight = clScores[idx];
                    var err = void 0,
                        errTreshold = void 0;
                    for (var j = 0; j < clCount; j++) {
                        if (j == idx) continue;
                        var ratio = clIntervals[idx] / clIntervals[j];
                        var isFraction = ratio < 1;
                        var sumInc = 0;
                        var d = isFraction ? Math.round(1 / ratio) : Math.round(ratio);
                        if (d < 2 || d > 8) continue;

                        if (isFraction) {
                            err = Math.abs(clIntervals[idx] * d - clIntervals[j]);
                            errTreshold = widthTreshold;
                        } else {
                            err = Math.abs(clIntervals[idx] - d * clIntervals[j]);
                            errTreshold = widthTreshold * d;
                        }
                        if (err >= errTreshold) continue;

                        if (isFraction) {
                            newSum += clIntervals[j] / d * clScores[j];
                        } else {
                            newSum += clIntervals[j] * d * clScores[j];
                        }
                        newWeight += clScores[j];
                    }
                    var beat = newSum / newWeight;

                    while (beat < minBeatInterval) {
                        beat *= 2;
                    }while (beat > maxBeatInterval) {
                        beat /= 2;
                    }tempoList.push(beat);
                }
                return tempoList;
            }
        }]);

        return TempoInduction;
    }();

    exports.default = TempoInduction;
    module.exports = exports["default"];
});
(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(["module", "exports"], factory);
  } else if (typeof exports !== "undefined") {
    factory(module, exports);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod, mod.exports);
    global.Agent = mod.exports;
  }
})(this, function (module, exports) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  var _createClass = function () {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    return function (Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  }();

  var Agent = function () {
    /**
     * Constructor
     * @param {Number} tempo - tempo hypothesis of the Agent
     * @param {Number} firstBeatTime - the time of the first beat accepted by this Agent
     * @param {Number} firsteventScore - salience value of the first beat accepted by this Agent
     * @param {Array} agentList - reference to the agent list 
     * @param {Object} [params={}] - parameters     
     * @param {Number} [params.expiryTime=10] - the time after which an Agent that has not accepted any beat will be destroyed
     * @param {Number} [params.toleranceWndInner=0.04] - the maximum time that a beat can deviate from the predicted beat time without a fork occurring
     * @param {Number} [params.toleranceWndPre=0.15] - the maximum amount by which a beat can be earlier than the predicted beat time, expressed as a fraction of the beat period
     * @param {Number} [params.toleranceWndPost=0.3] - the maximum amount by which a beat can be later than the predicted beat time, expressed as a fraction of the beat period
     * @param {Number} [params.correctionFactor=50] - correction factor for updating beat period
     * @param {Number} [params.maxChange=0.2] - the maximum allowed deviation from the initial tempo, expressed as a fraction of the initial beat period
     * @param {Number} [params.penaltyFactor=0.5] - factor for correcting score, if onset do not coincide precisely with predicted beat time
     */
    function Agent(tempo, firstBeatTime, firsteventScore, agentList) {
      var params = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};

      _classCallCheck(this, Agent);

      /** 
       * the time after which an Agent that has not accepted any beat will be destroyed
       * @type {Number} 
       */
      this.expiryTime = params.expiryTime || 10;
      /** 
       * the maximum time that a beat can deviate from the predicted beat time without a fork occurring
       * @type {Number} 
       */
      this.toleranceWndInner = params.toleranceWndInner || 0.04;
      /** 
       * the maximum amount by which a beat can be earlier than the predicted beat time, expressed as a fraction of the beat period
       * @type {Number} 
       */
      this.toleranceWndPre = params.toleranceWndPre || 0.15;
      /** 
       * the maximum amount by which a beat can be later than the predicted beat time, expressed as a fraction of the beat period
       * @type {Number} 
       */
      this.toleranceWndPost = params.toleranceWndPost || 0.3;

      this.toleranceWndPre *= tempo;
      this.toleranceWndPost *= tempo;

      /** 
       * correction factor for updating beat period
       * @type {Number} 
       */
      this.correctionFactor = params.correctionFactor || 50;
      /** 
       * the maximum allowed deviation from the initial tempo, expressed as a fraction of the initial beat period
       * @type {Number} 
       */
      this.maxChange = params.maxChange || 0.2;
      /** 
       * factor for correcting score, if onset do not coincide precisely with predicted beat time
       * @type {Number} 
       */
      this.penaltyFactor = params.penaltyFactor || 0.5;

      /** 
       * the current tempo hypothesis of the Agent, expressed as the beat period
       * @type {Number} 
       */
      this.beatInterval = tempo;
      /** 
       * the initial tempo hypothesis of the Agent, expressed as the beat period
       * @type {Number}
       */
      this.initialBeatInterval = tempo;
      /** 
       * the time of the most recent beat accepted by this Agent
       * @type {Number} 
       */
      this.beatTime = firstBeatTime;
      /** 
       * the number of beats found by this Agent, including interpolated beats
       * @type {Number} 
       */
      this.totalBeatCount = 1;
      /** 
       * the array of onsets accepted by this Agent as beats, plus interpolated beats
       * @type {Array} 
       */
      this.events = [firstBeatTime];
      /** 
       * sum of salience values of the onsets which have been interpreted as beats by this Agent
       * @type {Number} 
       */
      this.score = firsteventScore;
      /** 
       * reference to the agent list 
       * @type {Array} 
       */
      this.agentListRef = agentList;
    }
    /**
     * The event time is tested if it is a beat time
     * @param {Number} eventTime - the event time to be tested
     * @param {Number} eventScore - salience values of the event time
     * @return {Boolean} indicate whether the given event time was accepted as a beat time
     */


    _createClass(Agent, [{
      key: "considerEvent",
      value: function considerEvent(eventTime, eventScore) {
        if (eventTime - this.events[this.events.length - 1] > this.expiryTime) {
          this.score = -1;
          return false;
        }

        var beatCount = Math.round((eventTime - this.beatTime) / this.beatInterval);
        var err = eventTime - this.beatTime - beatCount * this.beatInterval;

        if (beatCount > 0 && err >= -this.toleranceWndPre && err <= this.toleranceWndPost) {
          if (Math.abs(err) > this.toleranceWndInner) {
            this.agentListRef.push(this.clone());
          }
          this.acceptEvent(eventTime, eventScore, err, beatCount);
          return true;
        }
        return false;
      }
    }, {
      key: "acceptEvent",
      value: function acceptEvent(eventTime, eventScore, err, beatCount) {
        this.beatTime = eventTime;
        this.events.push(eventTime);

        var corrErr = err / this.correctionFactor;
        if (Math.abs(this.initialBeatInterval - this.beatInterval - corrErr) < this.maxChange * this.initialBeatInterval) {
          this.beatInterval += corrErr;
        }
        this.totalBeatCount += beatCount;
        var errFactor = err > 0 ? err / this.toleranceWndPost : err / -this.toleranceWndPre;
        var scoreFactor = 1 - this.penaltyFactor * errFactor;
        this.score += eventScore * scoreFactor;
      }
    }, {
      key: "fillBeats",
      value: function fillBeats() {
        var prevBeat = void 0,
            nextBeat = void 0,
            currentInterval = void 0,
            beats = void 0;
        prevBeat = 0;
        if (this.events.length > 2) {
          prevBeat = this.events[0];
        }

        for (var i = 0; i < this.events.length; i++) {
          nextBeat = this.events[i];
          beats = Math.round((nextBeat - prevBeat) / this.beatInterval - 0.01);
          currentInterval = (nextBeat - prevBeat) / beats;
          var k = 0;
          for (; beats > 1; beats--) {
            prevBeat += currentInterval;
            this.events.splice(i + k, 0, prevBeat);
            k++;
          }
          prevBeat = nextBeat;
        }
      }
    }, {
      key: "clone",
      value: function clone() {
        var newAgent = new Agent();
        newAgent.beatInterval = this.beatInterval;
        newAgent.initialBeatInterval = this.initialBeatInterval;
        newAgent.beatTime = this.beatTime;
        newAgent.totalBeatCount = this.totalBeatCount;
        newAgent.events = this.events.slice();
        newAgent.expiryTime = this.expiryTime;
        newAgent.toleranceWndInner = this.toleranceWndInner;
        newAgent.toleranceWndPre = this.toleranceWndPre;
        newAgent.toleranceWndPost = this.toleranceWndPost;
        newAgent.correctionFactor = this.correctionFactor;
        newAgent.maxChange = this.maxChange;
        newAgent.penaltyFactor = this.penaltyFactor;
        newAgent.score = this.score;
        newAgent.agentListRef = this.agentListRef;

        return newAgent;
      }
    }]);

    return Agent;
  }();

  exports.default = Agent;
  module.exports = exports["default"];
});
(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["module", "exports", "./Agent"], factory);
    } else if (typeof exports !== "undefined") {
        factory(module, exports, require("./Agent"));
    } else {
        var mod = {
            exports: {}
        };
        factory(mod, mod.exports, global.Agent);
        global.BeatTracking = mod.exports;
    }
})(this, function (module, exports, _Agent) {
    "use strict";

    Object.defineProperty(exports, "__esModule", {
        value: true
    });

    var _Agent2 = _interopRequireDefault(_Agent);

    function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : {
            default: obj
        };
    }

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    var _createClass = function () {
        function defineProperties(target, props) {
            for (var i = 0; i < props.length; i++) {
                var descriptor = props[i];
                descriptor.enumerable = descriptor.enumerable || false;
                descriptor.configurable = true;
                if ("value" in descriptor) descriptor.writable = true;
                Object.defineProperty(target, descriptor.key, descriptor);
            }
        }

        return function (Constructor, protoProps, staticProps) {
            if (protoProps) defineProperties(Constructor.prototype, protoProps);
            if (staticProps) defineProperties(Constructor, staticProps);
            return Constructor;
        };
    }();

    var BeatTracking = function () {
        function BeatTracking() {
            _classCallCheck(this, BeatTracking);
        }

        _createClass(BeatTracking, null, [{
            key: "trackBeat",
            value: function trackBeat(events, eventsScores, tempoList) {
                var params = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

                var initPeriod = params.initPeriod || 5,
                    thresholdBI = params.thresholdBI || 0.02,
                    thresholdBT = params.thresholdBT || 0.04;
                function removeSimilarAgents() {
                    agents.sort(function (a1, a2) {
                        return a1.beatInterval - a2.beatInterval;
                    });
                    var length = agents.length;
                    for (var i = 0; i < length; i++) {
                        if (agents[i].score < 0) continue;
                        for (var _j = i + 1; _j < length; _j++) {
                            if (agents[_j].beatInterval - agents[i].beatInterval > thresholdBI) {
                                break;
                            }
                            if (Math.abs(agents[_j].beatTime - agents[i].beatTime) > thresholdBT) {
                                continue;
                            }
                            if (agents[i].score < agents[_j].score) {
                                agents[i].score = -1;
                            } else {
                                agents[_j].score = -1;
                            }
                        }
                    }
                    for (var _i = length - 1; _i >= 0; _i--) {
                        if (agents[_i].score < 0) {
                            agents.splice(_i, 1);
                        }
                    }
                }
                var agents = [];

                for (var i = 0; i < tempoList.length; i++) {
                    agents.push(new _Agent2.default(tempoList[i], events[0], eventsScores[0], agents, params));
                }
                var j = 1;
                removeSimilarAgents();

                while (events[j] < initPeriod) {
                    var agentsLength = agents.length;
                    var prevBeatInterval = -1;
                    var isEventAccepted = true;
                    for (var k = 0; k < agentsLength; k++) {
                        if (agents[k].beatInterval != prevBeatInterval) {
                            if (!isEventAccepted) {
                                agents.push(new _Agent2.default(prevBeatInterval, events[j], eventsScores[j], agents, params));
                            }
                            prevBeatInterval = agents[k].beatInterval;
                            isEventAccepted = false;
                        }
                        isEventAccepted = agents[k].considerEvent(events[j], eventsScores[j]) || isEventAccepted;
                    }
                    removeSimilarAgents();
                    j++;
                }
                var eventsLength = events.length;
                for (var _i2 = j; _i2 < eventsLength; _i2++) {
                    var _agentsLength = agents.length;
                    for (var _j2 = 0; _j2 < _agentsLength; _j2++) {
                        agents[_j2].considerEvent(events[_i2], eventsScores[_i2]);
                    }
                    removeSimilarAgents();
                }

                return agents;
            }
        }]);

        return BeatTracking;
    }();

    exports.default = BeatTracking;
    module.exports = exports["default"];
});
(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(["module", "exports", "./OnsetDetection", "./TempoInduction", "./BeatTracking", "./FFT"], factory);
  } else if (typeof exports !== "undefined") {
    factory(module, exports, require("./OnsetDetection"), require("./TempoInduction"), require("./BeatTracking"), require("./FFT"));
  } else {
    var mod = {
      exports: {}
    };
    factory(mod, mod.exports, global.OnsetDetection, global.TempoInduction, global.BeatTracking, global.FFT);
    global.MusicTempo = mod.exports;
  }
})(this, function (module, exports, _OnsetDetection, _TempoInduction, _BeatTracking, _FFT) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  var _OnsetDetection2 = _interopRequireDefault(_OnsetDetection);

  var _TempoInduction2 = _interopRequireDefault(_TempoInduction);

  var _BeatTracking2 = _interopRequireDefault(_BeatTracking);

  var _FFT2 = _interopRequireDefault(_FFT);

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
      default: obj
    };
  }

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  var MusicTempo =
  /**
   * Constructor
   * @param {Float32Array} audioData - non-interleaved IEEE 32-bit linear PCM with a nominal range of -1 -> +1 (Web Audio API - Audio Buffer)
   * @param {Object} [params={}] - parameters
   * @param {Number} [params.bufferSize=2048] - FFT windows size
   * @param {Number} [params.hopSize=441] - spacing of audio frames in samples
   * @param {Number} [params.decayRate=0.84] - how quickly previous peaks are forgotten
   * @param {Number} [params.peakFindingWindow=6] - minimum distance between peaks
   * @param {Number} [params.meanWndMultiplier=3] - multiplier for peak finding window
   * @param {Number} [params.peakThreshold=0.35] - minimum value of peaks
   * @param {Number} [params.widthTreshold=0.025] - the maximum difference in IOIs which are in the same cluster
   * @param {Number} [params.maxIOI=2.5] - the maximum IOI for inclusion in a cluster
   * @param {Number} [params.minIOI=0.07] - the minimum IOI for inclusion in a cluster
   * @param {Number} [params.maxTempos=10] - initial amount of tempo hypotheses
   * @param {Number} [params.minBeatInterval=0.3] - the minimum inter-beat interval (IBI) (0.30 seconds == 200 BPM)
   * @param {Number} [params.maxBeatInterval=1] - the maximum inter-beat interval (IBI) (1.00 seconds ==  60 BPM)
   * @param {Number} [params.initPeriod=5] - duration of the initial section
   * @param {Number} [params.thresholdBI=0.02] - for the purpose of removing duplicate agents, the default JND of IBI
   * @param {Number} [params.thresholdBT=0.04] - for the purpose of removing duplicate agents, the default JND of phase
   * @param {Number} [params.expiryTime=10] - the time after which an Agent that has not accepted any beat will be destroyed
   * @param {Number} [params.toleranceWndInner=0.04] - the maximum time that a beat can deviate from the predicted beat time without a fork occurring
   * @param {Number} [params.toleranceWndPre=0.15] - the maximum amount by which a beat can be earlier than the predicted beat time, expressed as a fraction of the beat period
   * @param {Number} [params.toleranceWndPost=0.3] - the maximum amount by which a beat can be later than the predicted beat time, expressed as a fraction of the beat period
   * @param {Number} [params.correctionFactor=50] - correction factor for updating beat period
   * @param {Number} [params.maxChange=0.2] - the maximum allowed deviation from the initial tempo, expressed as a fraction of the initial beat period
   * @param {Number} [params.penaltyFactor=0.5] - factor for correcting score, if onset do not coincide precisely with predicted beat time
   */
  function MusicTempo(audioData) {
    var _this = this;

    var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, MusicTempo);

    if (audioData instanceof Float32Array) {
      // Production steps of ECMA-262, Edition 6, 22.1.2.1
      if (!Array.from) {
        Array.from = function () {
          var toStr = Object.prototype.toString;
          var isCallable = function isCallable(fn) {
            return typeof fn === 'function' || toStr.call(fn) === '[object Function]';
          };
          var toInteger = function toInteger(value) {
            var number = Number(value);
            if (isNaN(number)) {
              return 0;
            }
            if (number === 0 || !isFinite(number)) {
              return number;
            }
            return (number > 0 ? 1 : -1) * Math.floor(Math.abs(number));
          };
          var maxSafeInteger = Math.pow(2, 53) - 1;
          var toLength = function toLength(value) {
            var len = toInteger(value);
            return Math.min(Math.max(len, 0), maxSafeInteger);
          };

          // The length property of the from method is 1.
          return function from(arrayLike /*, mapFn, thisArg */) {
            // 1. Let C be the this value.
            var C = this;

            // 2. Let items be ToObject(arrayLike).
            var items = Object(arrayLike);

            // 3. ReturnIfAbrupt(items).
            if (arrayLike == null) {
              throw new TypeError('Array.from requires an array-like object - not null or undefined');
            }

            // 4. If mapfn is undefined, then let mapping be false.
            var mapFn = arguments.length > 1 ? arguments[1] : void undefined;
            var T;
            if (typeof mapFn !== 'undefined') {
              // 5. else
              // 5. a If IsCallable(mapfn) is false, throw a TypeError exception.
              if (!isCallable(mapFn)) {
                throw new TypeError('Array.from: when provided, the second argument must be a function');
              }

              // 5. b. If thisArg was supplied, let T be thisArg; else let T be undefined.
              if (arguments.length > 2) {
                T = arguments[2];
              }
            }

            // 10. Let lenValue be Get(items, "length").
            // 11. Let len be ToLength(lenValue).
            var len = toLength(items.length);

            // 13. If IsConstructor(C) is true, then
            // 13. a. Let A be the result of calling the [[Construct]] internal method 
            // of C with an argument list containing the single item len.
            // 14. a. Else, Let A be ArrayCreate(len).
            var A = isCallable(C) ? Object(new C(len)) : new Array(len);

            // 16. Let k be 0.
            var k = 0;
            // 17. Repeat, while k < len… (also steps a - h)
            var kValue;
            while (k < len) {
              kValue = items[k];
              if (mapFn) {
                A[k] = typeof T === 'undefined' ? mapFn(kValue, k) : mapFn.call(T, kValue, k);
              } else {
                A[k] = kValue;
              }
              k += 1;
            }
            // 18. Let putStatus be Put(A, "length", len, true).
            A.length = len;
            // 20. Return A.
            return A;
          };
        }();
      }
      audioData = Array.from(audioData);
    } else if (!Array.isArray(audioData)) {
      throw "audioData is not an array";
    }
    var timeStep = params.timeStep || 0.01;
    var res = _OnsetDetection2.default.calculateSF(audioData, _FFT2.default, params);
    /** 
     * Spectral flux
     * @type {Array} 
     */
    this.spectralFlux = res;
    _OnsetDetection2.default.normalize(this.spectralFlux);
    /** 
     * Spectral flux peaks indexes
     * @type {Array} 
     */
    this.peaks = _OnsetDetection2.default.findPeaks(this.spectralFlux, params);
    /** 
     * Onsets times array
     * @type {Array} 
     */
    this.events = this.peaks.map(function (a) {
      return a * timeStep;
    });

    var clusters = _TempoInduction2.default.processRhythmicEvents(this.events, params);
    clusters = _TempoInduction2.default.mergeClusters(clusters, params);
    var scores = _TempoInduction2.default.calculateScore(clusters, params);
    clusters = {
      clIntervals: clusters.clIntervals,
      clSizes: clusters.clSizes,
      clScores: scores.clScores,
      clScoresIdxs: scores.clScoresIdxs
    };
    /** 
     * Tempo hypotheses array
     * @type {Array} 
     */
    this.tempoList = _TempoInduction2.default.createTempoList(clusters, params);

    var minSFValue = this.spectralFlux.reduce(function (a, b) {
      return Math.min(a, b);
    });
    var eventsScores = this.peaks.map(function (a) {
      return _this.spectralFlux[a] - minSFValue;
    });
    /** 
     * Agents array
     * @type {Array} 
     */
    this.agents = _BeatTracking2.default.trackBeat(this.events, eventsScores, this.tempoList, params);

    var bestScore = -1;
    var idxBestAgent = -1;
    /** 
     * The tempo value in beats per minute
     * @type {Number} 
     */
    this.tempo = -1;
    /** 
     * Beat times array
     * @type {Array} 
     */
    this.beats = [];
    /** 
     * Inter-beat interval
     * @type {Number} 
     */
    this.beatInterval = -1;

    for (var i = 0; i < this.agents.length; i++) {
      if (this.agents[i].score > bestScore) {
        bestScore = this.agents[i].score;
        idxBestAgent = i;
      }
    }
    if (this.agents[idxBestAgent]) {
      /** 
       * The agent with the highest score
       * @type {Agent} 
       */
      this.bestAgent = this.agents[idxBestAgent];
      this.bestAgent.fillBeats();
      this.tempo = (60 / this.bestAgent.beatInterval).toFixed(3);
      this.beatInterval = this.bestAgent.beatInterval;
      this.beats = this.bestAgent.events;
    }
    if (this.tempo == -1) {
      throw "Tempo extraction failed";
    }
  };

  exports.default = MusicTempo;
  module.exports = exports["default"];
});

// Classic worker: upstream Music Tempo's browser bundle exposes MusicTempo on self.
self.onmessage = ({data}) => {
  const {id, method, mono, rate, beatsPerBar, assisted, startSeconds} = data;
  try {
    let result;
    if (method === 'original' || method === 'corrected') {
      const raw = (method === 'original' ? original : corrected)(mono, rate, beatsPerBar);
      if (!raw) throw new Error('No stable beat grid found.');
      const origin = assisted ? 0 : raw.downbeatSeconds;
      const fix = correctDrift(mono, {sampleRate:rate,beatsPerBar,segments:[{line:0,frame:origin*rate,beatFrames:60*rate/raw.bpm}],offsets:{},downbeats:[0]});
      result = {bpm:60*rate/fix.grid.segments[0].beatFrames,origin:origin+startSeconds,rawBpm:raw.bpm,confidence:raw.confidence,segments:fix.grid.segments.map(s=>({line:s.line,time:s.frame/rate+startSeconds,period:s.beatFrames/rate})),matches:fix.matches,relocks:fix.relocks,originKind:assisted?'User downbeat':'Estimated bar 1'};
    } else if (method === 'music') {
      const detected = new self.MusicTempo(mono);
      const bpm = Number(detected.tempo);
      result = {bpm,origin:assisted?startSeconds:detected.beats[0]+startSeconds,beats:detected.beats.map(t=>t+startSeconds),originKind:assisted?'User downbeat':'First tracked beat (bar 1 unknown)'};
    } else {
      const detected = guess(mono,rate); // Upstream defaults, including its 90–180 BPM range.
      result = {bpm:detected.bpm,unroundedBpm:detected.tempo,origin:assisted?startSeconds:detected.offset+startSeconds,originKind:assisted?'User downbeat':'Beat offset (bar 1 unknown)'};
    }
    if (!Number.isFinite(result.bpm) || result.bpm<=0 || !Number.isFinite(result.origin)) throw new Error('No usable tempo or beat origin.');
    self.postMessage({id,result});
  } catch (error) { self.postMessage({id,error:error?.message || String(error)}); }
};
