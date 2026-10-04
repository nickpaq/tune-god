# Calibration projects

- `calibration.koala`: test tones at exact pitches, for checking the pitch detector (`scripts/generateCalibration.ts`).
- `mix-calibration.koala`: 18 synthesized sounds of known peak level, one per sound type (names carry the level, for example `snare_-3dBFS`), for calibrating the mix side of the export (`python3 scripts/generateMixCalibration.py`). Pad 16 is a looping one-beat kick at 110 BPM and pad 17 a looping sustained 55 Hz bass: play both and the bass should duck once the export has put a sidechain on the bass bus. Pad 18 is a 1 kHz tone at -20 dBFS as a loudness reference. Pads start on Main with no effects and the pad EQ off.

How to use the mix project: load it in KoalaTune, switch on the mixer options, export, open the result in Koala, and compare what Koala shows and plays against what the app wrote (see `docs/koala-mixer-reference.md`).
