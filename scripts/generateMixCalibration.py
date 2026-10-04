#!/usr/bin/env python3
"""Builds docs/calibration/mix-calibration.koala: synthesized sounds of known levels, one per sound type, for calibrating the
mix side of the export (loudness balance, bus routing, sidechain, clipper, EQ). Nothing here is meant to sound good.

Run: python3 scripts/generateMixCalibration.py [template.koala]
The template is any Koala project; its song.json, sequence.json and pad layout are reused (default: the project in docs/fixtures).
Pad names say what each sound is and its peak level in dBFS. Pad 15 is a looping one-beat kick (110 BPM) and pad 16 a looping
sustained 55 Hz bass: play both and the bass should duck once the export puts a sidechain on the bass bus.
"""
import io, json, math, random, struct, sys, zipfile
from pathlib import Path

SR = 44100
BPM = 110
BEAT = 60 / BPM
random.seed(7)

def db(x): return 10 ** (x / 20)

def tone(f, dur, decay=0.0, harmonics=(1.0,), sweep=None, sweep_tau=0.05):
    n = int(SR * dur); out = []; ph = 0.0
    for i in range(n):
        t = i / SR
        fr = f * (1 + (sweep - 1) * math.exp(-t / sweep_tau)) if sweep else f
        ph += 2 * math.pi * fr / SR
        v = sum(a * math.sin(ph * (k + 1)) for k, a in enumerate(harmonics))
        out.append(v * math.exp(-decay * t))
    return out

def noise(dur, decay=0.0, hp=0.0):
    n = int(SR * dur); out = []; prev = 0.0; prev_x = 0.0
    for i in range(n):
        x = random.uniform(-1, 1)
        y = x - prev_x + hp * prev if hp else x   # one-pole highpass
        prev_x, prev = x, y
        out.append(y * math.exp(-decay * i / SR))
    return out

def mix(*parts):
    n = max(len(p) for p in parts); out = [0.0] * n
    for p in parts:
        for i, v in enumerate(p): out[i] += v
    return out

def delay(sig, sec): return [0.0] * int(SR * sec) + sig

def fade(sig, ms=3):
    k = int(SR * ms / 1000)
    for i in range(min(k, len(sig))): sig[i] *= i / k; sig[-1 - i] *= i / k
    return sig

def peak_to(sig, peak_db):
    m = max(abs(v) for v in sig) or 1.0
    g = db(peak_db) / m
    return [v * g for v in sig]

def wav24(sig):
    body = bytearray()
    for v in sig:
        q = max(-8388608, min(8388607, int(round(v * 8388607))))
        body += struct.pack("<i", q)[:3]
    hdr = b"RIFF" + struct.pack("<I", 36 + len(body)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, SR, SR * 3, 3, 24) + b"data" + struct.pack("<I", len(body))
    return hdr + bytes(body)

def kick(dur=0.5): return fade(tone(45, dur, decay=7, sweep=3.3, sweep_tau=0.04))
def snare(): return mix(noise(0.25, decay=18, hp=0.2), tone(190, 0.25, decay=20))
def hat(dur, decay): return noise(dur, decay=decay, hp=0.95)
chord = lambda f, dur, dec: mix(*[tone(f * r, dur, decay=dec, harmonics=(1, .4, .2)) for r in (1, 1.189, 1.498)])

def drum_loop():
    bar = BEAT * 4; total = int(SR * bar * 2); out = [0.0] * total
    def put(sig, at):
        s = int(SR * at)
        for i, v in enumerate(sig):
            if s + i < total: out[s + i] += v
    for b in range(8):
        if b % 2 == 0: put(kick(0.35), b * BEAT)
        if b % 2 == 1: put(snare(), b * BEAT)
        put(hat(0.07, 60), b * BEAT); put(hat(0.07, 60), b * BEAT + BEAT / 2)
    return out

def chord_loop():
    bar = BEAT * 4
    return mix(chord(220, bar, 0.8), delay(chord(261.63, bar, 0.8), bar))

def riser():
    n = int(SR * 2); out = []; ph = 0.0
    for i in range(n):
        t = i / SR; ph += 2 * math.pi * (200 + 4000 * (t / 2) ** 2) / SR
        out.append((math.sin(ph) * 0.5 + random.uniform(-1, 1) * 0.5) * (t / 2))
    return out

def vox():
    n = int(SR * 0.7); out = []; ph = 0.0
    for i in range(n):
        t = i / SR; ph += 2 * math.pi * 140 / SR
        v = sum(math.sin(ph * k) * a for k, a in ((1, 1), (2, .7), (5, .6), (6, .5), (13, .3)))
        out.append(v * min(1, t * 30) * math.exp(-1.5 * t))
    return out

def clap():
    return mix(*[delay(noise(0.04, decay=60, hp=0.6), k * 0.011) for k in range(3)], noise(0.25, decay=14, hp=0.6))

# (file name the app classifies from, signal, peak dBFS, looping)
SOUNDS = [
    ("kick_calibration_-3dBFS.wav", kick(), -3, False),
    ("kick_quiet_-18dBFS.wav", kick(), -18, False),
    ("808_bass_E1_41Hz_-6dBFS.wav", fade(tone(41.2, 1.5, decay=1.2, harmonics=(1, .15))), -6, False),
    ("bass_A1_55Hz_-9dBFS.wav", fade(tone(55, 1.0, decay=1.5, harmonics=(1, .5, .25))), -9, False),
    ("snare_-3dBFS.wav", fade(snare()), -3, False),
    ("clap_-6dBFS.wav", fade(clap()), -6, False),
    ("closed_hat_-3dBFS.wav", fade(hat(0.07, 60)), -3, False),
    ("open_hat_-6dBFS.wav", fade(hat(0.45, 9)), -6, False),
    ("crash_cymbal_-6dBFS.wav", fade(noise(1.6, decay=2.2, hp=0.9)), -6, False),
    ("tom_perc_-6dBFS.wav", fade(tone(180, 0.4, decay=9, sweep=1.6)), -6, False),
    ("vox_chant_-9dBFS.wav", fade(vox()), -9, False),
    ("riser_fx_-6dBFS.wav", fade(riser()), -6, False),
    ("piano_stab_A3_-9dBFS.wav", fade(chord(220, 1.0, 2.5)), -9, False),
    ("melodic_loop_Am_110bpm_-9dBFS.wav", fade(chord_loop()), -9, False),
    ("drum_loop_110bpm_-3dBFS.wav", fade(drum_loop()), -3, False),
    ("kick_beat_110bpm_-3dBFS.wav", fade(kick(BEAT)[: int(SR * BEAT)]), -3, True),
    ("bass_sustain_55Hz_-9dBFS.wav", tone(55, 8.0), -9, True),
    ("reference_1kHz_-20dBFS.wav", fade(tone(1000, 2.0)), -20, False),
]

def main():
    out_dir = Path(__file__).resolve().parent.parent / "docs" / "calibration"
    template = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "docs" / "fixtures" / "mix-calibration-template.koala"
    with zipfile.ZipFile(template) as t:
        song, seq = t.read("song.json"), t.read("sequence.json")
        pad0 = json.loads(t.read("sampler/sampler.json"))["pads"][0]
    samples, pads = [], []
    z = io.BytesIO()
    with zipfile.ZipFile(z, "w", zipfile.ZIP_STORED) as zf:
        for i, (name, sig, peak, looping) in enumerate(SOUNDS):
            data = wav24(peak_to(sig, peak))
            frames = (len(data) - 44) // 3
            zf.writestr(f"sampler/{i + 1}.wav", data)
            samples.append({"id": i + 1, "metadata": {"bpm": 0.0, "creationTime": "2026-10-04 00:00:00", "musicalKey": "", "originalPath": name, "rootNote": "none", "source": "Imported", "tags": []}})
            pad = dict(pad0)
            pad.update({"pad": str(i), "sampleId": i + 1, "start": 0, "end": frames, "zoomStart": 0, "zoomEnd": frames, "bus": -1, "label": name.rsplit("_", 1)[0], "vol": 1.0, "pan": 0.5,
                        "looping": "true" if looping else "false", "oneshot": "false" if looping else "true", "loopPoint": -1, "hasLoopPoint": "false", "chokeGroup": 0})
            pad["eq"] = {**pad0["eq"], "enabled": "false"}
            pads.append(pad)
        zf.writestr("sampler/sampler.json", json.dumps({"samples": samples, "pads": pads}))
        buses = [{"chain": [None] * 5, "mute": False, "name": n, "solo": False, "volume": 0.0} for n in ("kick", "bass", "drums", "melodic")]
        zf.writestr("mixer.json", json.dumps({"buses": buses, "master": {"chain": [None] * 5, "mute": False, "name": "MAIN", "solo": False, "volume": 0.0}}))
        zf.writestr("song.json", song)
        zf.writestr("sequence.json", seq)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "mix-calibration.koala").write_bytes(z.getvalue())
    print(f"wrote {out_dir / 'mix-calibration.koala'} ({len(z.getvalue()) // 1024} KB, {len(SOUNDS)} pads)")

main()
