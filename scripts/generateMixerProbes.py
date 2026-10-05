#!/usr/bin/env python3
"""Builds two small Koala projects that measure how Koala's own mixer behaves, so presets can use real behaviour instead of guesses.

  docs/calibration/probe-sidechain.koala  a kick on bus A, a held 55 Hz bass on buses B, C and D with a SIDECHAIN of different thresholds
                                          each (and once on Main with none). Patterns: kick alone, bass alone, then each threshold.
  docs/calibration/probe-eq.koala         white noise through EQ plugins with different settings on the buses, and through per-pad EQs
                                          with different settings on Main, against a plain reference. The transfer function of each
                                          shows what the lo, mid and hi bands really are (highpass, shelf or bell) and what gain does.

Load them straight into Koala (no KoalaTune export needed), render the one long pattern as a single WAV,
and run scripts/analyzeMixerProbes.py on it. Run: python3 scripts/generateMixerProbes.py
"""
import importlib.util, io, json, random, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("cal", HERE / "generateMixCalibration.py")
cal = importlib.util.module_from_spec(spec); spec.loader.exec_module(cal)
SR, BPM, TICKS_BEAT, TICKS_BAR, STEP = cal.SR, cal.BPM, cal.TICKS_BEAT, cal.TICKS_BAR, cal.STEP
random.seed(11)

def white_noise(dur):
    return cal.fade([random.uniform(-1, 1) for _ in range(int(SR * dur))], ms=5)

NEUTRAL_EQ = {"lo freq": 20.0, "lo gain": 0.0, "lo Q": 1.0, "mid freq": 1000.0, "mid gain": 0.0, "mid Q": 1.0, "hi freq": 12000.0, "hi gain": 0.0, "hi Q": 1.0}
def eq_plugin(**changes):
    return {"bypass": False, "name": "EQ", "parameters": {**NEUTRAL_EQ, **changes}}
def sidechain(threshold, output=0.0, release=80.0):
    return {"bypass": False, "name": "SIDECHAIN", "parameters": {"source": 0.0, "threshold": float(threshold), "release": float(release), "output": float(output)}}
def strip(name, fx=None):
    return {"chain": [fx] + [None] * 4 if fx else [None] * 5, "mute": False, "name": name, "solo": False, "volume": 0.0}

def build(path, sounds, pad_specs, buses, patterns, template):
    """sounds: [(file name, signal, peak dBFS)]; pad_specs: [{sound, bus, eq, looping}]; patterns: [(name, notes, bars)] (+1 empty bar added), all merged into one long pattern."""
    with zipfile.ZipFile(template) as t:
        song, seq = t.read("song.json"), json.loads(t.read("sequence.json")); pad0 = json.loads(t.read("sampler/sampler.json"))["pads"][0]
    z = io.BytesIO(); samples, pads = [], []
    with zipfile.ZipFile(z, "w", zipfile.ZIP_STORED) as zf:
        for i, (name, sig, peak) in enumerate(sounds):
            data = cal.wav24(cal.peak_to(sig, peak)); zf.writestr(f"sampler/{i + 1}.wav", data)
            samples.append({"id": i + 1, "metadata": {"bpm": 0.0, "creationTime": "2026-10-05 00:00:00", "musicalKey": "", "originalPath": name, "rootNote": "none", "source": "Imported", "tags": []}})
        for i, ps in enumerate(pad_specs):
            frames = len(sounds[ps["sound"]][1])
            pad = dict(pad0); looping = ps.get("looping", False)
            pad.update({"pad": str(i), "sampleId": ps["sound"] + 1, "start": 0, "end": frames, "zoomStart": 0, "zoomEnd": frames, "bus": ps["bus"], "label": ps["label"], "vol": 1.0, "pan": 0.5,
                        "looping": "true" if looping else "false", "oneshot": "false" if looping else "true", "loopPoint": -1, "hasLoopPoint": "false", "chokeGroup": 0})
            pad["eq"] = ps["eq"] if "eq" in ps else {**pad0["eq"], "enabled": "false"}
            pads.append(pad)
        zf.writestr("sampler/sampler.json", json.dumps({"samples": samples, "pads": pads}))
        zf.writestr("mixer.json", json.dumps({"buses": buses, "master": strip("MAIN")}))
        zf.writestr("song.json", song)
        seq.update({"autoPlay": "next", "currSequenceId": 0, "quantizeDivision": 16, "quantizing": True, "seqSnap": "Sequence", "swing": 0.0, "bpm": float(BPM), "beatsPerBar": 4})
        merged, at = [], 0
        for _n, notes, bars in patterns:
            merged += [{**n, "timeOffset": n["timeOffset"] + at * TICKS_BAR} for n in notes]; at += bars + 1
        seq["sequences"][0]["noteSequence"]["pattern"] = {"notes": sorted(merged, key=lambda n: (n["timeOffset"], n["num"])), "numBars": at}
        zf.writestr("sequence.json", json.dumps(seq))
    Path(path).write_bytes(z.getvalue())
    bar_s = 60 / BPM * 4; at = 0; lines = []
    for i, (name, _n, bars) in enumerate(patterns):
        lines.append(f"| {i + 1} | {name} | {at * bar_s:.3f} | {bars + 1} |"); at += bars + 1
    return lines, at * bar_s

def eqpad(**bands):
    base = {"enabled": "true", "lo": {"type": "highpass", "freq": 20.0, "gain": 0.0, "q": 1.0}, "mid": {"type": "peaking", "freq": 1000.0, "gain": 0.0, "q": 1.0}, "hi": {"type": "highshelf", "freq": 8000.0, "gain": 0.0, "q": 1.0}}
    for band, v in bands.items(): base[band] = {**base[band], **v}
    return base

def main():
    out = HERE.parent / "docs" / "calibration"; template = HERE.parent / "docs" / "fixtures" / "mix-calibration-template.koala"
    note = cal.note
    # ---- sidechain probe
    kick, bass = cal.kick(), cal.tone(55, 8.0)
    sounds = [("kick_-3dBFS.wav", cal.fade(kick), -3), ("bass_sustain_55Hz_-9dBFS.wav", bass, -9)]
    pads = [{"sound": 0, "bus": 0, "label": "kick on bus A"}] + [{"sound": 1, "bus": b, "label": f"bass on bus {'ABCD'[b] if b >= 0 else 'Main'}", "looping": True} for b in (1, 2, 3, -1)]
    variants = [(-16, 80), (-20, 80), (-20, 300)]  # (threshold dB, release ms) on buses B, C and D
    buses = [strip("kick"), *[strip(f"bass {t} / {r}", sidechain(t, release=r)) for t, r in variants]]
    kicks = [note(0, bar * TICKS_BAR + b * TICKS_BEAT, STEP * 4) for bar in range(4) for b in range(4)]
    hold = lambda pad: note(pad, 0, TICKS_BAR * 4)
    patterns = [("Kick alone", kicks, 4), ("Bass alone (Main, no sidechain)", [hold(4)], 4)] + [(f"Kick + bass, threshold {t} dB, release {r} ms, output 0 dB", kicks + [hold(p)], 4) for (t, r), p in zip(variants, (1, 2, 3))]
    rows, total = build(out / "probe-sidechain.koala", sounds, pads, buses, patterns, template)
    md = ["# Probe: sidechain", "", f"Load `probe-sidechain.koala` in Koala, render the one long pattern as a single WAV (110 BPM, 4/4, {total:.2f} s in all), then run `python3 scripts/analyzeMixerProbes.py sidechain <zip>`.", "", "| # | Section | Starts at (s) | Bars (with the empty one) |", "| --- | --- | --- | --- |", *rows, ""]
    # ---- EQ probe
    noise = white_noise(6.0)
    sounds = [("white_noise_-12dBFS.wav", noise, -12)]
    pads = [{"sound": 0, "bus": -1, "label": "reference: Main, no EQ"},
            {"sound": 0, "bus": 0, "label": "bus EQ: lo 150 Hz gain -12"}, {"sound": 0, "bus": 1, "label": "bus EQ: lo 150 Hz gain 0"},
            {"sound": 0, "bus": 2, "label": "bus EQ: hi 8 kHz gain -12"}, {"sound": 0, "bus": 3, "label": "bus EQ: mid 1 kHz gain -12 Q 1"},
            {"sound": 0, "bus": -1, "label": "pad EQ: lo 300 Hz gain -18", "eq": eqpad(lo={"freq": 300.0, "gain": -18.0})},
            {"sound": 0, "bus": -1, "label": "pad EQ: lo 300 Hz gain 0", "eq": eqpad(lo={"freq": 300.0, "gain": 0.0})},
            {"sound": 0, "bus": -1, "label": "pad EQ: hi 8 kHz gain -12", "eq": eqpad(hi={"freq": 8000.0, "gain": -12.0})},
            {"sound": 0, "bus": -1, "label": "pad EQ: mid 1 kHz gain -12", "eq": eqpad(mid={"freq": 1000.0, "gain": -12.0})}]
    buses = [strip("lo -12", eq_plugin(**{"lo freq": 150.0, "lo gain": -12.0, "lo Q": 0.7})), strip("lo 0", eq_plugin(**{"lo freq": 150.0, "lo gain": 0.0, "lo Q": 0.7})),
             strip("hi -12", eq_plugin(**{"hi freq": 8000.0, "hi gain": -12.0, "hi Q": 0.5})), strip("mid -12", eq_plugin(**{"mid freq": 1000.0, "mid gain": -12.0, "mid Q": 1.0}))]
    labels = ["Reference (Main, no EQ)", "Bus EQ lo 150 Hz gain -12 dB", "Bus EQ lo 150 Hz gain 0 dB (what the app writes)", "Bus EQ hi 8 kHz gain -12 dB", "Bus EQ mid 1 kHz gain -12 dB Q 1",
              "Pad EQ lo 300 Hz gain -18 dB (what the app writes)", "Pad EQ lo 300 Hz gain 0 dB", "Pad EQ hi 8 kHz gain -12 dB", "Pad EQ mid 1 kHz gain -12 dB"]
    patterns = [(labels[i], [note(i, 0, TICKS_BAR * 2)], 2) for i in range(9)]
    rows, total = build(out / "probe-eq.koala", sounds, pads, buses, patterns, template)
    md += ["# Probe: EQ", "", f"Load `probe-eq.koala` in Koala, render the one long pattern as a single WAV (110 BPM, 4/4, {total:.2f} s in all), then run `python3 scripts/analyzeMixerProbes.py eq <zip>`. Each pattern plays the same white noise (6 s long) through a different EQ; pattern 1 is the reference.", "", "| # | Section | Starts at (s) | Bars (with the empty one) |", "| --- | --- | --- | --- |", *rows, ""]
    (out / "probe-timeline.md").write_text("\n".join(md))
    print("wrote probe-sidechain.koala, probe-eq.koala and probe-timeline.md")

main()
