# Koala mixer reference

What is known about Koala's `mixer.json`, for the export code in `src/audio/mixerChain.ts` and `src/audio/routing.ts`. Source: two real projects saved from Koala 2.0.12 with every plugin parameter at its minimum (`docs/fixtures/mixer-all-min.json`) and at its maximum (`mixer-all-max.json`; the EQ was set to lowest gain and highest Q, "the opposite of the other project"). Plugin placement in those files is arbitrary except the sidechain. Values are stored as real units (dB, Hz, ms), not 0 to 1 knob positions.

## Structure

- `buses[0..3]` are buses A to D, then `master` (name `MAIN`). Each strip: `chain` (always five slots, `null` when empty, otherwise `{bypass, name, parameters}`), `mute`, `name`, `solo`, `volume` (dB, 0 = unity).
- A pad's `bus` in `sampler/sampler.json` is 0 to 3 for A to D, -1 for Main. Confirmed against a project with pads routed to every bus: pad on bus 0 labelled kick, 1 bass, 2 drums, 3 melodic.
- The user's own template strips are named `kick`, `bass`, `drums`, `melodic`. That is the layout the app now writes (Kick, Bass, Drums, Melodic).
- Effect order is slot order. Slot position of the template plugins is arbitrary.
- **Two different EQs.** (1) The per-pad EQ lives on each pad in `sampler/sampler.json` as `eq` and is not a mixer plugin: `{enabled: "true", lo, mid, hi}`, each band `{type, freq, gain, q}`. Seen: `lo` type `highpass` (freq 139 to 180 Hz on the four test pads, shown with gain -18 and q 1), `mid` type `peaking` (1000 Hz, 0 dB, q 1) and `hi` type `highshelf` (8000 Hz, 0 dB, q 1); the last two are Koala's defaults. The ranges for the per-pad bands were not measured. Not written by the app yet. (2) The EQ plugin in the master strip, whose readings and ranges are in this file, is the one the user sent min and max values for, and the one the app's master chain adds.
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
- The per-pad EQ and the mixer EQ plugin are the same design (the user confirmed), so both share these ranges and the band types: **lo = highpass, mid = peaking bell, hi = high shelf** (types as stored on pads). An earlier note here that all three bands are bells was wrong. The lo band's gain is probably ignored because a highpass has none.

## Confirmed

- `CLIPPER.threshold` controls the shape of the clip curve as well as the level (user): near 0 dB the corners are sharp, a low threshold is a smooth S-curve (seen at -35 dB). `output` only attenuates (-36 to 0 dB).
- `LIMITER.gain` is **input gain** (-18 to +18 dB) into the limiter, per the user. The app writes -1 dB (see the reference mix below).
- Plugin names and every parameter name above.
- `SIDECHAIN.source` is a bus number (the dropdown named bus 0 "kick").
- `oversample` is the HQ button: 0 off, 1 on (DRIVE seen both ways; CLIPPER is the same control).
- `COMPRESSOR.makeup` is an on/off auto make-up button; `visual` is the KNEE/GRAPH view.
- Units: times in ms except PLATE REVERB `time` in seconds, gains and thresholds in dB, `mix`/`dry/wet`/`spread`/`jitter` as 0 to 1 fractions, `UTILITY.channel` 3 = L+R MONO.
- Ranges for gains, Q, ratio, times and the like, from the two files.

## Still not confirmed

- SIDECHAIN `output`: -12 to +12 dB, almost certainly an output gain after ducking, so the app writes 0. Duck depth is not a control.
- EQ mid band frequency range (the user never moved it; it sat near 1 kHz in both projects). Presumably the same 20 Hz to 20 kHz as the others.
- UTILITY `channel` values 1 and 2 (probably L only and R only); WARBLE (never changed).
- What the app writes at present is in `src/audio/mixerChain.ts`; a test (`mixerChain.test.ts`) checks it against the two fixtures.

## What the app writes

- Bass bus: SIDECHAIN (source kick, threshold -17 dB (round 3 sweeps), release 80 ms, output 0 dB).
- Kick bus: CLIPPER (input +4 dB, threshold -6 dB, output 0, HQ on).
- Melodic bus: EQ (lo highpass 150 Hz, hi shelf -2 dB at 8 kHz).
- Master: EQ (lo highpass 20 Hz, mid bell +2.5 dB at 70 Hz, hi shelf -3 dB at 8 kHz), DRIVE, COMPRESSOR, CLIPPER, LIMITER (-1 dB input gain), only into an empty master strip.
- Per pad (with Settings by sound type): `eq.lo.freq` highpass (80 to 300 Hz by type) and, on hats and cymbals, `eq.hi.gain` -2 dB.

## Sequence notes (read from a project with recorded patterns)

`sequence.json`: `{autoPlay, beatsPerBar, bpm, currSequenceId, quantizeDivision, quantizing, seqSnap, swing, sequences[32]}`. `autoPlay: "next"` chains each pattern into the next. Each sequence is `{lastViewedPath, noteSequence: {pattern: {notes, numBars}}, parameterSequences}`; `notes` is null when empty. A note is `{chance: 1.0, length, num (pad, 0-based), pan (-1.0078740119934082 = the pad's own pan), pitch: 0.0, start: 0.0, subPad: -1, timeOffset, vel}`. `timeOffset` and `length` are in ticks, **4096 per beat** (1024 per 16th), `vel` is 0 to 127. A 1-bar pattern at 4/4 is 16384 ticks. Checked against a render: 5 patterns of 2, 1, 1, 1 and 1 bars rendered to exactly 6 bars (13.09 s at 110 BPM, 48 kHz stereo 24-bit). Whether `length` is also in ticks is assumed. How velocity maps to level is measured by the Kick velocity pattern of the mix calibration project.

## Calibration render 1 (all mixer options on, pad settings and auto-colour off)

From `mix-calibration.koala` exported by the app, saved by Koala, and rendered as one WAV (`scripts/analyzeMixRender.py` repeats the measurements).

- **Koala keeps everything.** The project saved by Koala is identical to the export: every mixer plugin and value, every pad setting, all 18 WAVs and the sequences. Nothing is clamped or rewritten on load or save. The per-pad EQ was not exercised in this round (Settings by sound type was off).
- **Timing.** The 6 patterns rendered to 117.81 s (expected 117.82 s) with hits within about 2 ms of the grid. Each hit lands where `timeOffset` (4096 ticks per beat) says. `length` in ticks held a looping pad for the full pattern, so it is the same unit.
- **Master chain gain.** A 1 kHz tone through melodic bus and master came out +5.3 dB higher than the pad level: +3 dB LIMITER input gain and about +2.3 dB from DRIVE (6 dB drive at a 30% mix raises the level). Bass content gets about +2.5 dB more from the master EQ bell at 70 Hz. The limiter stops the render at about -0.25 dBFS.
- **Loudness.** The full groove integrates to -9.1 LUFS (BS.1770 gated) with a crest of 8.8 dB: inside the -8 to -10 target. The kick, 808 and bass all sit on the limiter (peak -0.3 dBFS); the kick alone is -4.5 LUFS over 200 ms.
- **Hats and cymbals were too far back.** Peaks of -14.1 (closed), -16.1 (open) and -21.7 dBFS (crash) against -1.8 for the snare: 12 to 20 dB under it. Cause: the crest cap in `crestBonusDb` (-5/-4/-4), not the trims. Fixed in the preset (trims -5/-4/-3, crest cap -1): predicted peaks about -10, -11 and -15 dBFS.
- **Velocity (corrected in round 2: it is linear, see below).** The kick is pinned at the limiter at every velocity (peak -0.28 to -0.30), so the curve cannot be read from it. Its 200 ms loudness fell 0.7, 2.0 and 3.9 dB at velocity 100, 70 and 40, much less than a linear velocity would, which suggests Koala's velocity only scales part of the level (about 0.5 + 0.5 x vel/127 fits). The next round measures it on the tom, which stays well under the limiter.
- **Sidechain (corrected in round 2: the deep duck was an artifact of the master limiter, see below).** Estimated by subtracting the kick-alone render: the bass fell more than 18 dB within 50 ms of each kick and took about 450 ms to come back (-12 dB at 200 ms, -4 dB at 400 ms), which at 110 BPM leaves the bass fully present only just before the next kick. That matches a kick about 18 dB over the old -24 dB threshold. The preset now uses threshold -14 dB and release 80 ms for a shallower, shorter duck. The estimate is blurred by the nonlinear master chain; render with the master chain off to measure it cleanly.
- **Not yet measurable:** the kick bus clipper (the limiter hides it) and the per-pad EQ.

### Next render

Export the updated calibration project from KoalaTune with **Heavy, warm master chain OFF**, route to buses ON and **Settings by sound type ON**, save it from Koala, and render the 6 patterns again. With the master chain off the limiter no longer hides the kick bus clipper or the sidechain, and the per-pad EQ is exercised. Run `python3 scripts/analyzeMixRender.py render.wav exported.koala`.

## Reference mix (the user's gold standard)

A 9-second screen recording of a streamed phonk track (`scripts/analyzeReference.py` repeats this). **It was delivered through YouTube, which changes the level (loudness normalisation) and re-encodes the audio, so its absolute loudness is not the master's and is not a target.** A gain change moves the peak and the loudness together, so the peak-to-loudness ratio, crest, tonal balance and stereo width are still usable, with the caveat that any dynamic processing a player adds (such as a "stable volume" setting) would also change them. The first 3 s are a quiet intro; these are the groove from 3.0 s on.

| | Reference | Our round-1 groove |
| --- | --- | --- |
| Peak-to-loudness | **12.2 dB** | 8.9 dB |
| Crest (peak - RMS) | 11.9 dB | 8.8 dB |
| L/R correlation, side/mid | 0.95, -15.6 dB | mono sources |
| (Integrated loudness, as recorded) | (-12.4 LUFS, not a target) | -9.1 LUFS |

Tonal balance (dB re total energy): sub 20-60 Hz -1.9, bass 60-150 -5.7, low 150-300 -13.2, low-mid 300-600 -18.5, mid 600-1.2k -23.4, hi-mid 1.2-2.5k -24.0, presence 2.5-5k -22.8, brilliance 5-10k -20.6, air 10k+ -26.9. Sub and bass carry the track; the mids and presence sit about 20 dB under the total and the top end is clear but not bright. Our groove matched the sub and bass (-2.7, -3.9) but its mids were far lower, because the synthetic sounds are sines and noise bursts, so only the low end and the dynamics are comparable.

What it means for the preset: our master was more squashed than the reference (peak-to-loudness 9 dB against 12), so the limiter is driven less hard. LIMITER input gain went from +3 to -1 dB for this, which is a guess at how much less. The target is the 12 dB ratio, not a loudness: measure the next groove render's peak-to-loudness with `analyzeMixRender.py` and adjust the gain until it is about 12 dB. Melodic content should keep a moderate stereo width (side about 15 dB under mid), not mono. A reference that did not go through a streaming service would also fix an absolute loudness target.

## Calibration round 2 (master chain off; pad settings, buses and per-pad EQ on)

The app's export and the project saved by Koala are identical again (pads, mixer, WAVs); Koala changed only the "current pattern" marker in `sequence.json`. The renders came as Koala's Loops export: six files in pattern order, 48 kHz stereo AAC, each exactly its bar count long. `scripts/analyzeMixRender.py` reads them once stitched in order.

- **Velocity is linear amplitude: gain = vel / 127.** The tom (under every limiter) falls 2.1, 5.2 and 10.0 dB at velocity 100, 70 and 40, exactly 20 x log10(vel / 127). The kick falls less (1.0, 3.1, 7.7 dB) only because its bus clipper compresses the loud end. This replaces the round-1 guess of 0.5 + 0.5 x vel / 127, which came from a signal the limiter was pinning.
- **The sidechain at threshold -14 dB, release 80 ms barely ducks: about 2 to 3 dB at the deepest.** Round 1's duck of 18 dB or more was an artifact: the master limiter and compressor act differently on kick-plus-bass than on the kick alone, and subtracting the kick-alone render left their gain changes in the residual. With the master chain off the measurement is clean. The measurement itself reads shallow on a short duck (a synthetic 15 dB duck reads about 9.5 dB), so treat the depth as a ranking. `probe-sidechain.koala` sweeps the threshold (-24, -40, -60). The preset threshold is now -30 dB, provisional until that sweep is read.
- **A centred mono pad comes out about 2.5 to 3 dB under its pad level** (bass pads: pad level -8.7 dBFS, rendered -11.2 dBFS), the pan law of Koala's mixer.
- **The kick bus clipper (input +4, threshold -6)** takes a full-velocity kick from a pad peak of -3.7 to a rendered peak of -5.0 dBFS and adds about 4 dB below the knee (a velocity-40 kick comes out 1 dB hotter than its pad level less the pan law). The kick leads: -5.0 dBFS against -11.2 for the 808 and bass, -14.1 for the snare.
- **The per-pad EQ works as set.** A closed hat with a 300 Hz pad highpass reads -5.7 dB at 200 Hz and -18 dB at 100 Hz against the flat 1.5 to 5 kHz level (a second-order highpass at 300 Hz), the 8 kHz shelf at -2 dB reads about -2 dB at 12 kHz (open hat and crash alike), and a pad with no EQ is flat to within 0.3 dB. The pad's `lo.gain` stayed at the template's -18 and the filter still behaves as a highpass.
- **The melodic bus EQ is inconclusive.** Its lo band at 150 Hz with gain 0 should be a highpass if the plugin's lo band is one, but the test chord (220 Hz and up) is too high to show a 150 Hz filter (it would only take 0.9 dB off at 220 Hz). `probe-eq.koala` plays white noise through EQ plugins with different settings, so the lo band's shape and what gain does are measured directly. Until then the master EQ's "highpass at 20 Hz" and the melodic bus "highpass at 150 Hz" are assumptions and may be no-ops.
- **Levels with no master chain** (peak, loudest 200 ms LUFS): kick -5.0 / -14.6, 808 -11.2 / -18.3, bass -11.2 / -17.3, snare -14.1 / -25.9, clap -15.3 / -26.8, closed hat -18.8 / -32.5, open hat -19.5 / -27.8, crash -19.6 / -25.7, tom -18.6 / -25.5, vox -14.5 / -21.6, piano -15.8 / -23.8. The full groove peaks at -2.3 dBFS and integrates to -18.6 LUFS, a peak-to-loudness ratio of 16 dB, so the master chain has to take about 4 dB off the crest to reach the reference's 12 dB.

### Next renders

Two small projects measure Koala's mixer directly (no KoalaTune export needed; load them in Koala and render with Loops export): `docs/calibration/probe-sidechain.koala` and `docs/calibration/probe-eq.koala`, timelines in `probe-timeline.md`, read with `python3 scripts/analyzeMixerProbes.py sidechain|eq <zip>`. After those, one more full run with the master chain on and the limiter at -1 dB, to tune it to a 12 dB peak-to-loudness ratio.

## Round 3: probe renders (master chain off, read with `analyzeMixerProbes.py`)

Both probes were rendered as one continuous file each and split at the timeline times.

- **Sidechain threshold sweep (release 80 ms, output 0).** Depth is very steep in the threshold: -14 dB ducks 2 to 3 dB, -24 dB ducks about 17 dB at the deepest (bass back at 0 dB by 0.3 s), -40 dB reads deeper than 40 dB (back by 0.5 s) and -60 dB about 37 dB (still 8 dB down at 0.5 s). The very deep readings include some cancellation error from subtracting the kick-alone render, so read them as "very deep". The release time is not the recovery time: with release 80 ms the bass takes 0.3 to 0.5 s to return, longer the lower the threshold. The preset now uses -20 dB, interpolated, for a duck of roughly 8 to 10 dB. Not yet confirmed by a render at -20.
- **Bus EQ shapes.** `lo` is a low shelf (150 Hz, -12 dB: -12 dB at 30 to 50 Hz, -6 dB at 150 Hz, flat from 500 Hz), `hi` a high shelf (8 kHz, -12 dB: -6 dB at 8 kHz, -11 dB at 16 kHz), `mid` a bell (1 kHz, -12 dB, Q 1: -11.8 dB at 1 kHz, -4 dB at 500 Hz and -3.9 at 2 kHz). Gain 0 is exactly flat, and the corner frequency of a shelf is its half-gain point. Earlier notes calling the bus `lo` band a highpass were wrong: the highpass is the per-pad EQ.
- **Pad EQ shapes.** `lo` is a highpass: 300 Hz with gain -18 dB gives -38 dB at 30 Hz, -29 at 50, -17 at 100, -9.5 at 150, -4 at 200 and flat from 300 Hz (about 12 dB per octave, -3 dB point near 190 Hz). With `lo` gain 0 the pad is exactly flat, so gain 0 switches the highpass off. `hi` is a high shelf (8 kHz, -12 dB: -7.6 dB at 8 kHz, -12.6 at 12 kHz) and `mid` a bell like the bus one.

### Round 3b: sidechain probe 2 (one long pattern, master chain off)

Bass dB against no duck, mean of beats 5 to 16:

| Threshold / release | Deepest | +50 ms | +120 ms | +200 ms | +300 ms | +500 ms |
| --- | --- | --- | --- | --- | --- | --- |
| -16 dB / 80 ms | -7.7 | -7.0 | -3.7 | 0.1 | 0 | 0 |
| -20 dB / 80 ms | -19.6 | -14.0 | -7.2 | -1.7 | 0 | 0 |
| -20 dB / 300 ms | -23.4 | -15.7 | -10.3 | -5.8 | -4.3 | -0.7 |

Depth grows about 3.5 dB per dB of threshold (-14: 2 to 3 dB, -16: 7, -20: 14 at 50 ms, -24: 17 or more). A longer release deepens the duck and slows the recovery (0.5 s at 300 ms). The preset threshold is now -17 dB at release 80 ms, aiming at about 8 to 10 dB back by 0.2 s. Not yet checked in a full mix.

### Round 3b: the mix calibration render was of the raw project

`mix-calibration-3` came from the project without the app's export applied (no routing, trims, per-pad EQ or master chain): the 1 kHz reference at -20 dBFS reads -22.5 (the centred mono pan loss, -2.5 dB), every pad reads its own peak minus 2.5 to 3 dB, the kick shows no clipper and there is no ducking, and the full groove sums to 0.00 dBFS peak (crest 17.8 dB, -15.9 LUFS). That confirms the pan loss and shows the raw sum clips; it says nothing about the preset.
