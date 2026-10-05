#!/usr/bin/env python3
"""Reads the renders of the probe projects (scripts/generateMixerProbes.py).

Usage: python3 scripts/analyzeMixerProbes.py sidechain|eq <the one WAV/m4a of the whole pattern, or a zip or folder of 0.m4a 1.m4a ... in section order>
Needs ffmpeg, numpy and scipy. The probes are one long pattern: give the single render and it is cut into its sections.

  eq         the transfer function (dB, level out vs the reference noise) of every pattern at octave frequencies: whether a band is a
             highpass, a shelf or a bell, and what its gain does.
  sidechain  the bass's level (55 Hz band) after each kick against the bass alone, for each threshold: how deep the duck is and how long it lasts.
"""
import subprocess, sys, tempfile, wave, zipfile
from pathlib import Path
import numpy as np
from scipy.signal import butter, hilbert, sosfiltfilt, welch

BPM = 110; BEAT = 60 / BPM; BAR = BEAT * 4; SR = 48000

def decode(src, i, tmp):
    wavp = Path(tmp) / f"{i}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", str(wavp)], check=True)
    w = wave.open(str(wavp)); return (np.frombuffer(w.readframes(w.getnframes()), dtype="<i2") / 32768.0).reshape(-1, 2).mean(1)

SECTIONS = {"sidechain": (5, 5), "eq": (9, 3)}  # (sections, bars per section including the empty one); each probe is one long pattern

def load(arg, tmp, mode):
    p = Path(arg)
    if p.suffix == ".zip":
        with zipfile.ZipFile(p) as z: z.extractall(tmp)
        p = Path(tmp)
    one = [f for f in ([p] if p.is_file() else sorted(p.rglob("*"))) if f.suffix in (".m4a", ".wav", ".mp3", ".aac")]
    if len(one) == 1 and not one[0].stem.isdigit():  # the single render of the one long pattern: cut it into its sections
        n, bars = SECTIONS[mode]; x = decode(one[0], 0, tmp); step = int(round(bars * BAR * SR))
        return [x[i * step:(i + 1) * step] for i in range(n)]
    files = sorted((f for f in p.rglob("*") if f.suffix in (".m4a", ".wav", ".mp3", ".aac") and f.stem.isdigit()), key=lambda f: int(f.stem))
    return [decode(f, int(f.stem), tmp) for f in files]

def db(v): return 20 * np.log10(max(v, 1e-9))

def eq(files):
    ref = files[0]; seg = lambda x: x[int(.3 * SR):int(4.2 * SR)]
    f, Pr = welch(seg(ref), SR, nperseg=8192)
    probes = [30, 50, 100, 150, 200, 300, 500, 1000, 2000, 4000, 8000, 12000, 16000]
    print("pattern  " + " ".join(f"{p:>6}" for p in probes) + "   (Hz; dB against the reference, 1/3-octave smoothed)")
    for i, x in enumerate(files[1:], start=2):
        _, Px = welch(seg(x), SR, nperseg=8192)
        row = []
        for p in probes:
            band = (f >= p / 2 ** (1 / 6)) & (f < p * 2 ** (1 / 6)); row.append(10 * np.log10(Px[band].sum() / Pr[band].sum()))
        print(f"{i:>7}  " + " ".join(f"{v:6.1f}" for v in row))

def sidechain(files):
    kick_only, bass_only, variants = files[0], files[1], files[2:]
    sos = butter(2, [38, 85], btype="band", fs=SR, output="sos")  # wide enough that the envelope follows a duck within a few milliseconds
    env = lambda s: np.abs(hilbert(sosfiltfilt(sos, s)))
    base = env(bass_only[int(.5 * SR):int(4 * BAR * SR) - int(.5 * SR)]).mean()
    print(f"bass alone: 55 Hz envelope {db(base):.1f} dBFS\n")
    times = [.02, .05, .08, .12, .2, .3, .4, .5]
    print("variant   deepest   " + " ".join(f"+{t:.2f}s" for t in times) + "   (dB re bass alone, mean of beats 5 to 16)")
    n = int(BEAT * SR); pad = int(.3 * SR)
    for v, x in enumerate(variants, start=1):
        curves = []
        for beat in range(4, 16):
            s0 = int(beat * BEAT * SR); big = x[s0 - pad:s0 + n + pad] - kick_only[s0 - pad:s0 + n + pad]
            curves.append(env(big)[pad:pad + n])
        c = np.mean(curves, 0); ch = c / base
        print(f"{v:>7}   {db(ch.min()):6.1f}   " + " ".join(f"{db(ch[int(t * SR) - 200:int(t * SR) + 200].mean()):6.1f}" for t in times))

if len(sys.argv) < 3 or sys.argv[1] not in ("eq", "sidechain"):
    sys.exit(__doc__)
with tempfile.TemporaryDirectory() as tmp:
    files = load(sys.argv[2], tmp, sys.argv[1])
    print(f"{len(files)} renders read")
    (eq if sys.argv[1] == "eq" else sidechain)(files)
