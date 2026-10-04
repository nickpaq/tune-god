# Koala mixer reference

What is known about Koala's `mixer.json`, for the export code in `src/audio/mixerChain.ts` and `src/audio/routing.ts`. Source: two real projects saved from Koala 2.0.12 with every plugin parameter at its minimum (`docs/fixtures/mixer-all-min.json`) and at its maximum (`mixer-all-max.json`; the EQ was set to lowest gain and highest Q, "the opposite of the other project"). Plugin placement in those files is arbitrary except the sidechain. Values are stored as real units (dB, Hz, ms), not 0 to 1 knob positions.

## Structure

- `buses[0..3]` are buses A to D, then `master` (name `MAIN`). Each strip: `chain` (always five slots, `null` when empty, otherwise `{bypass, name, parameters}`), `mute`, `name`, `solo`, `volume` (dB, 0 = unity).
- A pad's `bus` in `sampler/sampler.json` is 0 to 3 for A to D, -1 for Main. Confirmed against a project with pads routed to every bus: pad on bus 0 labelled kick, 1 bass, 2 drums, 3 melodic.
- The user's own template strips are named `kick`, `bass`, `drums`, `melodic`. That is the layout the app now writes (Kick, Bass, Drums, Melodic).
- Effect order is slot order. Slot position of the template plugins is arbitrary.
- `sampler.json` pads also carry an `eq` object (`lo` highpass, `mid` peaking, `hi` highshelf; each `freq`, `gain`, `q`, `type`). Not used by the app yet.
- `song.json` holds app state (`selectedPad`, `padGrid`, `version`, ...). Not used by the app.

## Plugins and parameter ranges seen

Range is minimum-file value to maximum-file value. "Same in both files" means the user did not change that control, so the range is unknown.

- **STEREOIZER** (in the files: bus 1 (bass) slot 3): `low cut` 90 to 500; `spread` 0 to 1
- **SIDECHAIN** (in the files: bus 1 (bass) slot 4): `output` -12 to 12; `release` 10.0172 to 1000; `source` 0 (same in both files); `threshold` -59.97 to 0
- **UTILITY** (in the files: bus 2 (drums) slot 3): `channel` 3 to 0; `flip phase` 0 to 1; `gain` -18 to 18; `pan` 0.5 to 1
- **WARBLE** (in the files: bus 2 (drums) slot 4): `amount` 0 (same in both files); `flut speed` 7 (same in both files); `stop` 0 (same in both files); `wow speed` 0.2 (same in both files); `wow/flutter` 0.4 (same in both files)
- **PLATE REVERB** (in the files: bus 3 (melodic) slot 1): `brightness` 0 to 1; `dry/wet` 0 to 1; `pre-delay` 0 to 250; `size` 2 to 30; `time` 0.1 to 30
- **METER** (in the files: bus 3 (melodic) slot 2): `channel` 0 (same in both files); `zoom` 1 (same in both files)
- **LIMITER** (in the files: bus 3 (melodic) slot 3): `attack` 1.5 to 6; `gain` -18 to 18; `release` 60.0081 to 1000
- **FREEVERB** (in the files: bus 3 (melodic) slot 4): `dry/wet` 0 to 1; `size` 0 to 1; `stereo` 1 to 0; `tone` 0 to 1
- **EQ** (in the files: master slot 0): `hi Q` 0.5 to 10; `hi freq` 9236.29 to 12599.2; `hi gain` 18 to -18; `lo Q` 0.5 to 10; `lo freq` 20 to 31.748; `lo gain` 18 to -18; `mid Q` 0.5 to 10; `mid freq` 1016.11 to 1046.98; `mid gain` 18 to -18
- **DRIVE** (in the files: master slot 1): `drive` 0 to 36; `mix` 0.0003 to 1; `out` -90 to 0; `oversample` 0 to 1
- **COMPRESSOR** (in the files: master slot 2): `attack` 0.01 to 30; `makeup` 0 to 1; `ratio` 1 to 100; `release` 10.0321 to 1200; `threshold` -41.979 to -1.6922; `visual` 0 (same in both files)
- **CLIPPER** (in the files: master slot 3): `input` -35.982 to 36; `output` -36 to 0; `oversample` 0 (same in both files); `threshold` -34.5537 to -0.0846
- **BITCOOKER** (in the files: master slot 4): `bit depth` 3 to 24; `jitter` 0.0067 to 1; `mix` 0 to 1; `samplerate` 800 to 43970.2

## Confirmed

- Plugin names and every parameter name above.
- The SIDECHAIN plugin sat on the bass bus with `source` 0 in both files. The user placed it there as the kick-to-bass sidechain, so `source` is taken to be a bus number (0 = bus A, the kick bus).
- Ranges for gains, Q, ratio, times, mix and the like, from the two files.

## Not confirmed (user will supply screenshots)

- SIDECHAIN `output`: gain after ducking, or duck depth? The app writes 0.
- LIMITER `gain`: input gain or output ceiling? The app writes 0.
- COMPRESSOR `makeup`: units (0 to 1 here). The app writes 0.
- SIDECHAIN `source` as a bus number: inferred, not read from a screen.
- EQ `lo freq`, `mid freq`, `hi freq` ranges: those knobs were not moved between the files (values 20 to 31.7, about 1016 to 1047, 9236 to 12599 are knob positions, not limits).
- CLIPPER `oversample` is 0 in both files, so only 0 is known to be valid. DRIVE `oversample` is 0 to 1.
- UTILITY `channel` (3 in the min file, 0 in the max file) and WARBLE (identical in both) are not understood.
- What the app writes at present is in `src/audio/mixerChain.ts`; a test (`mixerChain.test.ts`) checks it against the two fixtures.
