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

## Read from screenshots of the minimum project

Screens of every plugin in the all-minimum project. They show how each stored value is labelled in Koala.

- **SIDECHAIN:** SOURCE is a dropdown listing the buses by name, and it showed "kick" with `source` 0, so `source` is the bus number (0 = A). THRESHOLD -60 dB, RELEASE 10.0 ms, OUTPUT -12.0 dB.
- **CLIPPER:** INPUT -36 dB, THRESH -35 dB, OUTPUT -36 dB, and an **HQ** button (off, `oversample` 0). The transfer curve is a soft clip.
- **DRIVE:** DRIVE 0 dB, MIX 0.03 % (`mix` is a 0 to 1 fraction), OUT -90 dB, **HQ** button (off, `oversample` 0; the maximum file has 1, so 1 is HQ on).
- **COMPRESSOR:** THRESHOLD -42 dB, RATIO 1.0, ATTACK 0.010 ms, RELEASE 10.0 ms. **makeup** is an on/off button (auto make-up gain), not a knob: `makeup` 0 = off, 1 = on. **KNEE / GRAPH** is a view switch (`visual` 0 = KNEE).
- **LIMITER:** GAIN -18.0 dB, ATTACK 1.5 ms, RELEASE 60 ms, with IN, G/R and OUT meters. The screen does not say whether GAIN is input gain or an output ceiling.
- **UTILITY:** CHANNEL is a dropdown, `channel` 3 = **L+R MONO** (0 in the maximum file, probably stereo; 1 and 2 not seen). GAIN -18 dB, PAN shows "C" at 0.5, **flip phase** button.
- **STEREOIZER:** SPREAD 0 %, LOW CUT 90 Hz.
- **PLATE REVERB:** TIME 100 ms (stored as 0.1, so `time` is in **seconds**, up to 30), SIZE 2.0 m (metres, 2 to 30), PRE-DELAY 0 ms, BRIGHTNESS 0, DRY/WET 0 %.
- **FREEVERB:** SIZE 0, TONE 0, DRY/WET 0 %, and a **stereo** button (lit, `stereo` 1 = on).
- **BITCOOKER:** SAMPLERATE 800 Hz, BIT DEPTH 3, JITTER 0.67 %, MIX 0 %.
- **EQ:** a graph with three draggable nodes (low, mid, high; the low and high nodes sit at the graph's edges, the high one read 12.6 kHz at -18 dB). The graph's frequency axis runs from about 20 Hz past 10 kHz.
- **Mixer screen:** buses kick, bass, drums, melodic and MAIN, five slots each. In the file, bass has STEREOIZER in slot 4 and SIDECHAIN in slot 5, drums UTILITY and WARBLE, melodic PLATE, METER, LIMITER, FREEVERB in slots 2 to 5, and MAIN EQ, DRIVE, COMP, CLIPPER, BITCOOKER.

## Read from screenshots of the maximum project

- **STEREOIZER:** SPREAD 100 %, LOW CUT 500 Hz (the display shows two coloured circles that separate as spread rises).
- **SIDECHAIN:** SOURCE still "kick", THRESHOLD 0 dB, RELEASE 1000 ms, OUTPUT +12.0 dB. Threshold runs -60 to 0 dB.
- **UTILITY:** CHANNEL **STEREO** (`channel` 0), GAIN +18 dB, PAN "R 100%" (`pan` 1; 0.5 is "C"), flip phase on. So `channel` 0 = STEREO and 3 = L+R MONO.
- **PLATE REVERB:** TIME 30.0 s, SIZE 30 m, PRE-DELAY 250 ms, BRIGHTNESS 1.0, DRY/WET 100 %.
- **LIMITER:** GAIN +18.0 dB, ATTACK 6.0 ms, RELEASE 1000 ms. The G/R meter looks the same at both extremes (a full bar), so it does not reveal what GAIN does.
- **FREEVERB:** SIZE 1.0, TONE 1.0, DRY/WET 100 %, **stereo** button off (`stereo` 0). The minimum project had it on.
- **EQ:** gain -18 dB on all bands, Q 10. The curve shows three bell (peaking) bands: narrow notches at about 1 kHz and at the two edge nodes (about 31 Hz and 12.6 kHz), with sharp resonant peaks beside the outer ones. The earlier EQ screenshot (-18 dB, Q 0.5) shows the same bands broad. The graph's frequency axis runs from about 20 Hz to a little past 12.6 kHz, and all three nodes sit at the bottom of the +-18 dB range.
- **DRIVE:** DRIVE 36 dB, MIX 100 %, OUT 0 dB, HQ lit (on).
- **COMPRESSOR:** THRESHOLD -1.7 dB, RATIO 100, ATTACK 30 ms, RELEASE 1200 ms, **makeup** lit (on), KNEE view.
- **CLIPPER:** INPUT +36 dB, THRESH -0.08 dB, OUTPUT 0 dB, HQ button not lit (so `oversample` 0 here is "off"; the control is the same kind as DRIVE's lit HQ button).
- **BITCOOKER:** SAMPLERATE 44.0 kHz, BIT DEPTH 24, JITTER 100 %, MIX 100 %.
- **Mixer layout screenshot:** matches the files (bass has STEREOIZER in slot 4 and SIDECHAIN in slot 5, and so on).

## EQ frequencies, from the user

- Minimum project: low band 20 Hz at +18 dB, high band 20 kHz at +18 dB, Q 0.5. Maximum project: low band 32 Hz at -18 dB, high band 12.6 kHz at -18 dB, Q 10.
- So the EQ's frequency range is 20 Hz to 20 kHz (the graph's whole width), and gain is +-18 dB. The stored `hi freq` in `mixer-all-min.json` is 9236 Hz, not 20 kHz, so that file was saved before the node was dragged to its end; `lo freq` 20 and 31.7 and `hi freq` 12599 match what the screen showed. The tests skip frequency parameters for that reason.
- The app's EQ preset (60 Hz, 1 kHz, 10 kHz) is inside that range.

## Confirmed

- Plugin names and every parameter name above.
- `SIDECHAIN.source` is a bus number (the dropdown named bus 0 "kick").
- `oversample` is the HQ button: 0 off, 1 on (DRIVE seen both ways; CLIPPER is the same control).
- `COMPRESSOR.makeup` is an on/off auto make-up button; `visual` is the KNEE/GRAPH view.
- Units: times in ms except PLATE REVERB `time` in seconds, gains and thresholds in dB, `mix`/`dry/wet`/`spread`/`jitter` as 0 to 1 fractions, `UTILITY.channel` 3 = L+R MONO.
- Ranges for gains, Q, ratio, times and the like, from the two files.

## Still not confirmed

- LIMITER `gain`: input gain or output ceiling. Both extremes (-18 and +18 dB) were seen and the meters do not say. The app writes 0, which is neutral if it is input gain.
- SIDECHAIN `output`: -12 to +12 dB, almost certainly an output gain after ducking, so the app writes 0. Duck depth is not a control.
- EQ mid band frequency range (the user never moved it; it sat near 1 kHz in both projects). Presumably the same 20 Hz to 20 kHz as the others.
- UTILITY `channel` values 1 and 2 (probably L only and R only); WARBLE (never changed).
- What the app writes at present is in `src/audio/mixerChain.ts`; a test (`mixerChain.test.ts`) checks it against the two fixtures.
