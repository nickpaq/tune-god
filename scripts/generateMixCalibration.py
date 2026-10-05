#!/usr/bin/env python3
"""Builds docs/calibration/mix-calibration.koala: synthesized sounds of known levels, one per sound type, for calibrating the
mix side of the export (loudness balance, bus routing, sidechain, clipper, EQ). Nothing here is meant to sound good.

Run: python3 scripts/generateMixCalibration.py [template.koala]
The template is any Koala project; its song.json, sequence.json and pad layout are reused (default: the project in docs/fixtures).
Pad names say what each sound is and its peak level in dBFS. Pad 16 is a looping one-beat kick (110 BPM) and pad 17 a looping
sustained 55 Hz bass.

It also writes six patterns (sequences 1 to 6, chained with autoPlay "next") to render as one continuous WAV, and
docs/calibration/mix-calibration-timeline.md, which says where each pattern and each hit lands in that WAV.
Note format (read from a Koala project with recorded notes): {chance, length, num (pad), pan (-1.0078740119934082 = pad's own),
pitch, start, subPad, timeOffset, vel}; timeOffset and length are in ticks, 4096 per beat (1024 per 16th), vel 0 to 127.
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

def kick(dur=0.28):
    """A short, punchy kick: a fast pitch drop from about 170 Hz to 48 Hz, a quick decay and a few milliseconds of click on the attack."""
    body = tone(48, dur, decay=16, sweep=3.6, sweep_tau=0.025)
    click = [0.45 * v for v in noise(0.006, decay=300, hp=0.5)]
    return fade(mix(body, click), ms=1)
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
        if b % 2 == 0: put(kick(), b * BEAT)
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
    ("kick_beat_110bpm_-3dBFS.wav", fade(kick() + [0.0] * (int(SR * BEAT) - int(SR * 0.28))), -3, True),
    ("bass_sustain_55Hz_-9dBFS.wav", tone(55, 8.0), -9, True),
    ("reference_1kHz_-20dBFS.wav", fade(tone(1000, 2.0)), -20, False),
]

TICKS_BEAT = 4096
TICKS_BAR = TICKS_BEAT * 4
STEP = TICKS_BEAT // 4  # a 16th note
PAD_PAN = -1.0078740119934082

def pad_of(prefix):
    return next(i for i, (name, *_rest) in enumerate(SOUNDS) if name.startswith(prefix))

def note(pad, at, length=STEP * 2, vel=127):
    return {"chance": 1.0, "length": length, "num": pad, "pan": PAD_PAN, "pitch": 0.0, "start": 0.0, "subPad": -1, "timeOffset": at, "vel": float(vel)}

def build_patterns():
    """Six patterns, each followed by one empty bar. Returns (name, notes, bars, what it measures)."""
    kick, kick_quiet, e808, snare_p = pad_of("kick_calibration"), pad_of("kick_quiet"), pad_of("808_bass"), pad_of("snare")
    ch, oh, crash = pad_of("closed_hat"), pad_of("open_hat"), pad_of("crash")
    bass_sus, ref, mel_loop, vox_p = pad_of("bass_sustain"), pad_of("reference"), pad_of("melodic_loop"), pad_of("vox")
    one_shot_pads = [i for i, (n, _s, _p, looping) in enumerate(SOUNDS) if not looping and n.startswith(("reference",)) is False]
    pats = []
    # 1. reference tone, doubles as the alignment marker
    pats.append(("Reference tone", [note(ref, 0, TICKS_BAR * 4)], 4, "1 kHz at -20 dBFS held for 4 bars: master level and meter reference"))
    # 2. level ladder: every sound once, one per bar, full velocity
    ladder, bar = [], 0
    for i in one_shot_pads + [pad_of("kick_beat"), bass_sus]:
        name, sig, _peak, looping = SOUNDS[i]
        ladder.append(note(i, bar * TICKS_BAR, TICKS_BAR - STEP if looping else STEP * 4))
        bar += 3 if len(sig) > SR * BEAT * 4 * 1.5 else 1  # a sound longer than a bar and a half gets three bars so it cannot bleed into the next
    pats.append(("Level ladder", ladder, bar, "each sound once at velocity 127, one per bar, in pad order: its real output level"))
    # 3. sidechain: four-on-the-floor kick over the held bass
    sc = [note(bass_sus, 0, TICKS_BAR * 4)] + [note(kick, bar * TICKS_BAR + b * TICKS_BEAT, STEP * 4) for bar in range(4) for b in range(4)]
    pats.append(("Sidechain", sc, 4, "kick on every beat over a held 55 Hz bass: ducking depth and release"))
    # 4. velocity: the kick (which the master limiter pins, so it shows the clipper and limiter) then the tom, which stays well under the limiter
    tom = pad_of("tom_perc")
    kv = [(127, 0), (100, 1), (70, 2), (40, 3)]
    kc = [note(kick, bar * TICKS_BAR, STEP * 4, vel) for vel, bar in kv] + [note(kick_quiet, 4 * TICKS_BAR, STEP * 4, 127)]
    kc += [note(tom, (5 + bar) * TICKS_BAR, STEP * 4, vel) for vel, bar in [(127, 0), (100, 1), (70, 2), (40, 3)]]
    pats.append(("Velocity", kc, 9, "kick at velocity 127, 100, 70, 40 (bars 1 to 4), the -18 dBFS kick at 127 (bar 5), then the tom at 127, 100, 70, 40 (bars 6 to 9): velocity curve and clipper"))
    # 5. hats and cymbals only
    hc = [note(ch, bar * TICKS_BAR + k * STEP * 2, STEP) for bar in range(2) for k in range(8)] + [note(oh, 2 * TICKS_BAR + STEP * 8, STEP * 4), note(crash, 3 * TICKS_BAR, STEP * 8)]
    pats.append(("Hats and cymbals", hc, 4, "closed hats on 8ths (bars 1 and 2), open hat (bar 3), crash (bar 4): pad highpass and high-shelf cut"))
    # 6. full groove, 8 bars
    g = []
    for bar in range(8):
        base = bar * TICKS_BAR
        g += [note(kick, base + 0), note(kick, base + STEP * 6), note(kick, base + STEP * 10), note(snare_p, base + STEP * 4), note(snare_p, base + STEP * 12)]
        g += [note(ch, base + k * STEP * 2, STEP) for k in range(8)]
        if bar % 2 == 1: g.append(note(oh, base + STEP * 14, STEP * 2))
        if bar % 2 == 0: g.append(note(e808, base, TICKS_BAR))
    g += [note(mel_loop, bar * TICKS_BAR, TICKS_BAR * 2) for bar in (0, 2, 4, 6)] + [note(vox_p, 4 * TICKS_BAR + STEP * 2, STEP * 8)]
    pats.append(("Full groove", g, 8, "kick, snare, hats, 808, melodic loop and vox together for 8 bars: overall balance and master chain"))
    return pats

def sequence_json(template_seq: bytes, pats):
    seq = json.loads(template_seq)
    seq.update({"autoPlay": "next", "currSequenceId": 0, "quantizeDivision": 16, "quantizing": True, "seqSnap": "Sequence", "swing": 0.0, "bpm": float(BPM), "beatsPerBar": 4})
    for i, (_name, notes, bars, _what) in enumerate(pats):
        seq["sequences"][i]["noteSequence"]["pattern"] = {"notes": sorted(notes, key=lambda n: (n["timeOffset"], n["num"])), "numBars": bars + 1}
    return json.dumps(seq)

def timeline_md(pats):
    bar_s = 60 / BPM * 4
    out = ["# Mix calibration timeline", "", f"Render patterns 1 to {len(pats)} in order as one continuous WAV at {BPM} BPM, 4/4 (one bar is {bar_s:.4f} s). Each pattern ends with one empty bar. A pad's level is the peak in dBFS written in its name; velocity is 127 unless noted.", "", "| # | Pattern | Starts at (s) | Bars (with the empty one) | Measures |", "| --- | --- | --- | --- | --- |"]
    at = 0
    for i, (name, _n, bars, what) in enumerate(pats):
        out.append(f"| {i + 1} | {name} | {at * bar_s:.3f} | {bars + 1} | {what} |")
        at += bars + 1
    out += ["", f"Total: {at} bars, {at * bar_s:.2f} s.", "", "## Hits", "", "Time in seconds = pattern start + timeOffset / 4096 beats x beat length.", ""]
    at = 0
    for i, (name, notes, bars, _w) in enumerate(pats):
        out.append(f"### {i + 1}. {name} (starts {at * bar_s:.3f} s)")
        out.append("")
        for n in sorted(notes, key=lambda n: (n["timeOffset"], n["num"])):
            t = at * bar_s + n["timeOffset"] / TICKS_BEAT * 60 / BPM
            out.append(f"- {t:7.3f} s  pad {n['num'] + 1:>2} {SOUNDS[n['num']][0].rsplit('.', 1)[0]}  vel {int(n['vel'])}  length {n['length']} ticks")
        out.append("")
        at += bars + 1
    return "\n".join(out)

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
        pats = build_patterns()
        zf.writestr("sequence.json", sequence_json(seq, pats))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "mix-calibration.koala").write_bytes(z.getvalue())
    (out_dir / "mix-calibration-timeline.md").write_text(timeline_md(build_patterns()))
    print(f"wrote {out_dir / 'mix-calibration.koala'} ({len(z.getvalue()) // 1024} KB, {len(SOUNDS)} pads)")

main()
