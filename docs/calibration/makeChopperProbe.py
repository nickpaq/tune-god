"""Builds docs/calibration/probe-chopper.koala from chopper-reference.koala: a 16 s sample of 16 one-second tones (slice i is a tone i semitones above A3,
so the pitch says which slice played) on three chopper pads, and three patterns chained with autoPlay next. Run: python3 -I makeChopperProbe.py"""
import json, math, struct, wave, zipfile, io, os

HERE = os.path.dirname(os.path.abspath(__file__))
SR, N = 48000, 16
TICKS = 4096

def sample() -> bytes:
    frames = bytearray()
    for i in range(N):
        f = 220.0 * 2 ** (i / 12)
        for n in range(SR):
            t = n / SR
            env = min(1.0, n / 480) * (1.0 if t < 0.9 else 0.0)
            v = int(0.3 * env * math.sin(2 * math.pi * f * t) * 32767)
            frames += struct.pack("<hh", v, v)
    buf = io.BytesIO()
    w = wave.open(buf, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(frames)); w.close()
    return buf.getvalue()

def velocity(slice_, count):  # same as sliceVelocity in src/audio/exportChopper.ts
    return min(127, max(1, int(math.floor(((slice_ + 0.5) * 127) / count + 0.5 + 0.5))))

ref = zipfile.ZipFile(os.path.join(HERE, "chopper-reference.koala"))
sampler = json.loads(ref.read("sampler/sampler.json"))
sequence = json.loads(ref.read("sequence.json"))
base = sampler["pads"][0]
slices = [{**base["chops"]["slices"][0], "start": i * SR, "originalStartPosition": i * SR, "userEdited": True, "power": 1.0} for i in range(N)]

def pad(index, one_shot, pitch, label, color_in_params=None, color_top=None):
    p = json.loads(json.dumps(base))
    p["pad"] = str(index)
    p["chops"] = {"slices": slices}
    sp = p["synthParams"]
    sp["ONE SHOT"] = 1.0 if one_shot else 0.0
    sp["padParams"]["label"] = label
    sp["padParams"]["pitch"] = pitch
    if color_in_params: sp["padParams"]["color"] = color_in_params
    if color_top: p["color"] = color_top
    return p

sampler["pads"] = [
    pad(0, True, 0.0, "A one-shot", color_in_params="#FF4040"),
    pad(1, True, 2.0, "B pitch +2", color_top="#4080FF"),
    pad(2, False, 0.0, "C one-shot OFF"),
]

def note(pad_, start_s, vel, length_ticks=1024, pitch=0.0):
    return {"chance": 1.0, "length": length_ticks, "num": pad_, "pan": -1.0078740119934082, "pitch": pitch, "start": 0.0, "subPad": -1, "timeOffset": int(round(start_s * 2 * TICKS)), "vel": float(vel)}  # 120 BPM: 2 beats per second

def pattern(notes, bars):
    return {"lastViewedPath": "", "noteSequence": {"pattern": {"notes": notes, "numBars": bars}}, "parameterSequences": None}

# P1 (8 bars): one note per slice at that slice's velocity (16 slices), 1 s apart. Tones should rise one semitone per note if velocity picks the slice.
p1 = [note(0, i, velocity(i, N)) for i in range(N)]
# P2 (8 bars): velocity scan 1, 9, 17 ... 121, one note per second: shows where the velocity bands change.
p2 = [note(0, i, 1 + 8 * i) for i in range(N)]
# P3 (6 bars): 0-5 s pitch test on pad A (pitch 0, 3, 12, -12 at velocity 110: does the note pitch change the slice?), 5 s vel 127, 6 s vel 1;
# 7-8 s pad B (pitch knob +2) slices 0 and 8; 9-10 s pad C (one-shot off, 1024 ticks only) slice 5 twice.
p3 = [note(0, 0, 110, pitch=0.0), note(0, 1, 110, pitch=3.0), note(0, 2, 110, pitch=12.0), note(0, 3, 110, pitch=-12.0), note(0, 4, 127), note(0, 5, 1),
      note(1, 7, velocity(0, N)), note(1, 8, velocity(8, N)), note(2, 9, velocity(5, N)), note(2, 10, velocity(5, N))]
sequence["sequences"][0] = pattern(p1, 8)
sequence["sequences"][1] = pattern(p2, 8)
sequence["sequences"][2] = pattern(p3, 6)
sequence["bpm"] = 120.0; sequence["autoPlay"] = "next"; sequence["currSequenceId"] = 0

out = zipfile.ZipFile(os.path.join(HERE, "probe-chopper.koala"), "w", zipfile.ZIP_DEFLATED)
out.writestr("sampler/sampler.json", json.dumps(sampler))
out.writestr("sampler/133.wav", sample())
out.writestr("sequence.json", json.dumps(sequence))
out.writestr("mixer.json", ref.read("mixer.json"))
out.writestr("song.json", ref.read("song.json"))
out.close()
print("velocities P1:", [velocity(i, N) for i in range(N)])
