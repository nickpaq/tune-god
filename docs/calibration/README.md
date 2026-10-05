# Calibration projects

- `calibration.koala`: test tones at exact pitches, for checking the pitch detector (`scripts/generateCalibration.ts`).
- `mix-calibration.koala`: 18 synthesized sounds of known peak level, one per sound type (names carry the level, for example `snare_-3dBFS`), plus six patterns (sequences 1 to 6, chained with auto-play) for calibrating the mix side of the export (`python3 scripts/generateMixCalibration.py`). Pad 16 is a looping one-beat kick at 110 BPM, pad 17 a looping sustained 55 Hz bass and pad 18 a 1 kHz tone at -20 dBFS. Pads start on Main with no effects and the pad EQ off.
- `mix-calibration-timeline.md`: where each pattern and each hit lands when the six patterns are rendered in order as one continuous WAV (about 127 s at 110 BPM).

How to use the mix project: load it in KoalaTune, switch on the mixer options, export, open the result in Koala, render the six patterns as one WAV, and compare the audio against the timeline and what the app wrote (see `docs/koala-mixer-reference.md`).

Before a calibration run, open the menu and note the version line at the bottom (version, git hash and mix preset) so the render can be tied to the build that made it.
