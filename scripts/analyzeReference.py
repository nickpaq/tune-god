#!/usr/bin/env python3
"""Measures a reference mix so the preset can be pointed at it: tonal balance by band, loudness, peak-to-loudness ratio and stereo width.

Usage: python3 scripts/analyzeReference.py audio.(wav|mp4|m4a|mp3) [start_seconds]
Anything ffmpeg can read works (a screen recording is fine). Pass a start time to skip an intro. Needs ffmpeg, numpy and scipy.
A streaming service may have turned the track down: if its peak is near 0 dBFS it was not, and the loudness is the master's own.
"""
import subprocess, sys, tempfile, wave
import numpy as np
from scipy.signal import lfilter, welch

BANDS = [("sub 20-60", 20, 60), ("bass 60-150", 60, 150), ("low 150-300", 150, 300), ("low-mid 300-600", 300, 600), ("mid 600-1.2k", 600, 1200),
         ("hi-mid 1.2-2.5k", 1200, 2500), ("presence 2.5-5k", 2500, 5000), ("brilliance 5-10k", 5000, 10000), ("air 10k+", 10000, 24000)]

def load(path, start):
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", t.name], check=True)
        w = wave.open(t.name); x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, 2) / 32768.0
    return x[int(start * 48000):].astype(np.float64), 48000

def integrated(x, sr):
    kw = lambda s: lfilter([1, -2, 1], [1, -1.99004745483398, 0.99007225036621], lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], s))
    K = np.stack([kw(x[:, 0]), kw(x[:, 1])], 1); W, H = int(.4 * sr), int(.1 * sr)
    ms = [(K[i:i + W] ** 2).mean(0).sum() for i in range(0, len(K) - W, H)]
    ms = [m for m in ms if -0.691 + 10 * np.log10(max(m, 1e-12)) > -70]
    rel = -0.691 + 10 * np.log10(np.mean(ms)) - 10
    return -0.691 + 10 * np.log10(np.mean([m for m in ms if -0.691 + 10 * np.log10(m) > rel]))

def main():
    x, sr = load(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.0)
    f, P = welch(x.mean(1), sr, nperseg=16384); tot = P.sum()
    print(f"{len(x) / sr:.1f} s analysed")
    for name, a, b in BANDS: print(f"  {name:<18} {10 * np.log10(P[(f >= a) & (f < b)].sum() / tot):6.1f} dB (re total)")
    pk = 20 * np.log10(np.abs(x).max()); L = integrated(x, sr); rms = 20 * np.log10(np.sqrt((x ** 2).mean()))
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    print(f"peak {pk:.2f} dBFS, integrated {L:.1f} LUFS, peak-to-loudness {pk - L:.1f} dB, crest (peak - RMS) {pk - rms:.1f} dB")
    print(f"L/R correlation {np.corrcoef(x[:, 0], x[:, 1])[0, 1]:.2f}, side/mid {10 * np.log10((side ** 2).mean() / max((mid ** 2).mean(), 1e-12)):.1f} dB")

main()
