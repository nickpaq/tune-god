#!/usr/bin/env python3
"""Measures a render of the mix calibration project against its patterns.

Usage: python3 scripts/analyzeMixRender.py render.wav exported_project.koala
Needs numpy and scipy. The render is the six patterns rendered in order as one WAV (16 or 24 bit PCM). The project supplies the
pattern layout (sequence.json) and the pad levels the app wrote (sampler.json). Prints the reference tone level, every pad's peak and
loudness in the level ladder, the velocity curve, the hats and cymbals, the full groove and an estimate of the sidechain ducking.
"""
import io, json, sys, wave, zipfile
import numpy as np
from scipy.signal import butter, hilbert, lfilter, sosfiltfilt

BPM = 110; BEAT = 60 / BPM; BAR = BEAT * 4

def read_wav(path):
    w = wave.open(path); sr = w.getframerate(); ch = w.getnchannels(); sw = w.getsampwidth(); raw = w.readframes(w.getnframes())
    if sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16); v = np.where(v >= 1 << 23, v - (1 << 24), v) / 8388608
    else:
        v = np.frombuffer(raw, dtype="<i2") / 32768
    return v.reshape(-1, ch).astype(np.float64), sr

def main():
    x, sr = read_wav(sys.argv[1])
    if x.shape[1] == 1: x = np.repeat(x, 2, 1)
    proj = zipfile.ZipFile(sys.argv[2]); seq = json.loads(proj.read("sequence.json")); sampler = json.loads(proj.read("sampler/sampler.json"))
    names = {int(p["pad"]): p["label"] for p in sampler["pads"]}
    pats, at = [], 0
    for i in range(6):
        p = seq["sequences"][i]["noteSequence"]["pattern"]; pats.append((at, p["numBars"], p["notes"] or [])); at += p["numBars"]
    T = lambda pat, off: pats[pat][0] * BAR + off / 4096 * BEAT
    db = lambda v: 20 * np.log10(max(v, 1e-9)); peak = lambda s: db(np.abs(s).max()) if len(s) else -999
    # BS.1770 K-weighting (48 kHz coefficients; the render is expected at 48 kHz)
    kw = lambda s: lfilter([1, -2, 1], [1, -1.99004745483398, 0.99007225036621], lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], s))
    K = np.stack([kw(x[:, 0]), kw(x[:, 1])], 1)
    def loud(a, b):
        W, H, best = int(.2 * sr), int(.01 * sr), -999
        for s in range(int(a * sr), max(int(a * sr) + 1, int(b * sr) - W + 1), H):
            seg = K[s:s + W]
            if len(seg) < W: break
            best = max(best, -0.691 + 10 * np.log10(max((seg ** 2).mean(0).sum(), 1e-12)))
        return best
    print(f"render {len(x) / sr:.2f} s, expected {at * BAR:.2f} s; whole-render peak {peak(x):.2f} dBFS")
    a = T(0, 0); seg = x[int((a + .5) * sr):int((a + 4 * BAR - .5) * sr)]
    print(f"\nREFERENCE TONE (1 kHz): peak {peak(seg):.2f} dBFS, {loud(a + .5, a + 4 * BAR - .5):.2f} LUFS")
    print("\nLEVEL LADDER: pad, peak dBFS, loudest-200ms LUFS")
    notes = sorted(pats[1][2], key=lambda n: n["timeOffset"])
    for k, nt in enumerate(notes):
        t = T(1, nt["timeOffset"]); nxt = T(1, notes[k + 1]["timeOffset"]) if k + 1 < len(notes) else T(2, 0)
        print(f"  {names.get(nt['num'], nt['num']):<28} {peak(x[int(t * sr):int(nxt * sr)]):7.2f}  {loud(t, min(nxt, t + 3)):7.1f}")
    print("\nVELOCITY: peak dBFS, loudest-200ms LUFS (kick bars 1-4, quiet kick bar 5, tom bars 6-9)")
    a0 = pats[3][0]
    for bar in range(min(9, pats[3][1] - 1)):
        t = (a0 + bar) * BAR; print(f"  bar {bar + 1}: {peak(x[int(t * sr):int((t + BAR) * sr)]):7.2f}  {loud(t, t + BAR):7.1f}")
    print("\nHATS AND CYMBALS: peak, LUFS")
    a0 = pats[4][0]
    for name, b0, b1 in [("closed hats", 0, 2), ("open hat", 2, 3), ("crash", 3, 4)]:
        t0, t1 = (a0 + b0) * BAR, (a0 + b1) * BAR; print(f"  {name:<12} {peak(x[int(t0 * sr):int(t1 * sr)]):7.2f}  {loud(t0, t1):7.1f}")
    a0 = pats[5][0]; t0 = a0 * BAR; seg = x[int(t0 * sr):int((t0 + 8 * BAR) * sr)]
    Ks = K[int(t0 * sr):int((t0 + 8 * BAR) * sr)]; W, H = int(.4 * sr), int(.1 * sr)
    ms = [(Ks[s:s + W] ** 2).mean(0).sum() for s in range(0, len(Ks) - W, H)]; ms = [m for m in ms if -0.691 + 10 * np.log10(max(m, 1e-12)) > -70]
    rel = -0.691 + 10 * np.log10(np.mean(ms)) - 10; g = [m for m in ms if -0.691 + 10 * np.log10(m) > rel]
    print(f"\nFULL GROOVE: peak {peak(seg):.2f} dBFS, integrated {-0.691 + 10 * np.log10(np.mean(g)):.1f} LUFS, RMS {db(np.sqrt((seg ** 2).mean())):.1f} dBFS, crest {peak(seg) - db(np.sqrt((seg ** 2).mean())):.1f} dB")
    # sidechain: subtract the kick alone (velocity pattern, bar 1) from each beat of the sidechain pattern and follow the 55 Hz residual
    mono = x.mean(1); sos = butter(3, [48, 62], btype="band", fs=sr, output="sos")
    env = lambda s: np.abs(hilbert(sosfiltfilt(sos, s)))
    bs = [n for n in notes if "bass_sustain" in names.get(n["num"], "")]
    if bs:
        tb = T(1, bs[0]["timeOffset"]); base = env(mono[int(tb * sr):int((tb + 2.1) * sr)])[int(.5 * sr):int(1.8 * sr)].mean()
        k0 = pats[3][0] * BAR; kick = mono[int(k0 * sr):int((k0 + BEAT) * sr)]; pad = int(.3 * sr); curves = []
        for beat in range(4, 12):
            s0 = T(2, 0) + beat * BEAT; big = mono[int((s0 - .3) * sr):int((s0 + BEAT + .3) * sr)]
            ko = np.concatenate([np.zeros(pad), kick, np.zeros(max(0, len(big) - pad - len(kick)))])[:len(big)]
            curves.append(env(big - ko)[pad:pad + len(kick)])
        c = np.mean(curves, 0)
        print("\nSIDECHAIN (estimate; the kick-alone render is subtracted, so a nonlinear master chain blurs it): 55 Hz level after a kick vs the bass alone")
        for t in (.02, .05, .08, .12, .2, .3, .4, .5): print(f"  +{t:.2f} s: {db(c[int(t * sr) - 200:int(t * sr) + 200].mean() / base):6.1f} dB")

main()
