# KoalaTune (tune-god)

A local-first web app for [Koala Sampler](https://koalasampler.com) projects. Drop in a `.koala` file, pick a key on the on-screen piano, and the app tunes the right pads to it, balances their loudness, colours and labels them, routes them to buses, and lets you rearrange them. Then it exports a new `.koala` file ready to open in Koala. Everything runs on-device in the browser; nothing is uploaded. It installs to an iOS home screen as a PWA and works offline after the first load.

## Features

### Loading and analysis
- Drop a `.koala` project (or tap to choose one). Every pad's audio is read at its **native sample rate and bit depth** (16/24/32-bit PCM and float WAV), with no resampling on load. Stereo is preserved end to end.
- Each pad is analysed on a background worker: a custom YIN pitch tracker finds the root note, and a classifier guesses the sound category.
- The last project, your per-pad choices and your pad arrangement are remembered between visits.

### Sound categories
Fifteen categories, from filename keywords first and then simple acoustic features (length, decay, spectral balance, detected pitch): **Kick, Snare, Clap, Closed Hat, Open Hat, Cymbal, Vox, Perc, FX, Bass, Melodic, Drum Loop, Perc Loop, Melodic Loop, Other**. Crash, ride and other cymbals are Cymbals (the hat tone), and an unnamed hat ringing over 1 s counts as one; toms, shakers and tambourines count as Perc; chants and breaths are Vox. A hat with no open/closed keyword in its name is called open when it rings longer than 0.3 s. A name containing "loop" turns its category into the loop version ("perc loop" is a Perc Loop); breaks and amens are Drum Loops; unnamed samples over 4 s are Melodic Loops if pitched and Drum Loops otherwise.  If you re-type a sound that sits on the finger-drumming page so it no longer fits its slot, a sound of the slot's type from a later page takes its place (or a missing-pad gap if there is none). Categories drive tuning, colour, labels, loudness trims and bus routing.

Change a pad's category in the pad panel, or use the **Sound classifier** (menu, below the finger drumming presets): it lists every sound in the project with a play button (raw audio, or the normalized audio once Normalize now has run, with a short fade so stopping never clicks), a delete button, and one checkbox per category. Each checkbox is coloured like its pad, so related types (snare and clap, both hats, vox and perc) show as neighbouring shades of one tone.

### Long samples
A sample longer than 60 s makes export very slow, so importing a project that contains any shows a warning listing them, with play and delete buttons for each (or keep them all). The limit is `MAX_SAMPLE_SECONDS` in `src/App.tsx`.

### Tuning
- Pick a key on the piano; pads classified Bass, Melodic or Melodic Loop with a detected pitch are tuned to it by default, decided by the classifier alone (everything else is left alone). Koala's own stretch setting on a pad is never changed. You can toggle Tune per pad, and manual choices survive key changes.
- Each pad has semitone and cent trim sliders (a custom precision slider, so iOS Safari behaves).
- **Tone** plays a reference sine on the chosen key alongside a pad for ear-checking.
- Tapping a pad plays it held and looping, retuning live as you move sliders. Live preview uses the browser's playback-rate change for instant response.
- **Export uses a much higher quality repitch:** a 256-tap Kaiser-windowed sinc resampler (about 140 dB stopband, 4096 interpolated kernel phases, double-precision accumulation). Measured on pure tones the error is about -145 to -150 dB and the response is flat through 19 kHz. The repitch is a sampler-style resample, so duration and formants shift with pitch and transients stay crisp. `scripts/checkResample.ts` reproduces the measurements.
- Resampled audio is only scaled down, and only if a peak would pass -0.1 dBFS, so exports never clip.

### Loudness balancing ("Balance loudness" + "Normalize now")
- Every sample is measured with ITU-R BS.1770 K-weighting (the LUFS filter), taking its loudest 200 ms window so short one-shots and long loops compare fairly. `scripts/checkLoudness.ts` checks the meter against the standard's reference values.
- Files are gain-matched to the same perceived loudness with a **-1 dBFS peak ceiling**. The common level is the highest one at which about 90% of samples fit under the ceiling; the few peakiest are held at the ceiling. A peak (knob trim included) is also held to within 8 dB of that common level, so short transients like snares can't peak far above everything else. The kick is the exception: it sits 3 dB above the common level with 5 dB more peak room (hip-hop).
- The **mix** goes on each pad's volume knob as a per-category trim (kick 0 dB, snare and bass -1, clap -2, vox, drum loops and other -3, perc -4, melodic -4, hats -6, cymbals -7, FX -6, perc and melodic loops -5; editable in `src/audio/loudness.ts`). Koala's knob is linear amplitude (`vol = 10^(dB/20)`, verified against a real project), so a knob at 0 dB plays the normalized file at its full level.
- **Normalize now** renders the same balance for playback, so pad taps are level-matched while you work. With the checkbox on but the button unpressed, balancing happens only at export.

### Colour and labels
- **Auto-color pads by sound type** writes a colour and a label to every pad on export, and the same label shows on the pads in the app. Drums show their category (Open Hat, Clap), other sounds show a filename keyword (Piano, Pluck, Riser, Vox, 808) and fall back to the category name. See `src/audio/padLabels.ts`. 15 palettes; each holds ten base tones (kick, snare/clap, hats, perc/vox, FX, bass, melodic, other, drum and perc loops, melodic loop) and categories in one tone are shades of it, so snare and clap read as a family while kick stands apart. Pick one from the palette browser.

### Bus routing
- **Route pads to buses by sound type** writes each pad's bus: Bus A drums (kick, snare, clap, hats, perc, drum and perc loops), Bus B bass, Bus C melodic (and melodic loops), Bus D vox and FX, Main for Other. It also names the buses *Drums, Bass, Melodic, Vox & FX* in the project's `mixer.json`, keeping each bus's effects and levels. (Koala's bus numbers are A=0 to D=3 and Main=-1. Bus D = 3 is inferred from the pattern; A to C and Main were seen in real projects.)

### Playback settings
- **Settings by sound type** writes Koala's per-pad `chokeGroup`, `oneshot` and `release` on export: hats (open and closed) go to mute group 5 and one-shot on, bass to mute group 6 with one-shot off and a 0.3 s release, other drums (kick, snare, clap, cymbal, perc, vox) to one-shot on, melodic sounds to one-shot off with the same 0.3 s release. Loops, FX and Other are left as they were. Edit `src/audio/padSettings.ts` to change it.

### Stereo spread
- **Spread melodic pads** gives melodic pads a balanced random pan (pairs at equal and opposite distances up to 40% either side; an odd one stays centred). Bass, drums and the rest stay centred.

### Rearranging pads
- **Drag and drop:** press and drag a pad (about 12 px of movement; a short tap still plays). Dropping on an occupied pad swaps them; on an empty pad moves the sound. Category, tuning, trims and all pad settings move with the sound.
- **All-pads view:** hover a dragged pad over the A/B/C/D bank buttons and all 64 pads open, coloured by category, so you can drop onto any bank. While it is open a **trash can** (top-left) deletes the sound and **Unused pad** (top-right) puts it on the next empty pad. Dropping straight on a bank letter uses that bank's first empty pad.
- **Export remaps everything:** pads are renumbered, notes in recorded sequences follow their pads (notes on deleted pads are dropped), the selected pad is updated, and deleted sounds' audio is removed from the project.

### Undo and redo
- Circular undo/redo buttons at the bottom-left. Covers pad edits (tune, trims, category), key changes, pad moves, swaps and deletes. Slider drags count as one step; up to 100 steps; cleared when a new project loads.

### Export
- **Export** bakes tuning into the audio (24-bit WAV), writes volumes, colours, labels, pans, buses and the rearrangement, and downloads `<name>_tuned.koala`. Pads you don't retune or rebalance keep their original audio byte for byte. A progress counter shows on the button during long renders.

### Interface
- The page is locked so it never scrolls or rubber-bands; the layout is drawn over a screenshot-based phone frame and scales to any width.

## How pitch detection works

A custom YIN tracker, hardened against the classic failure of locking onto a note's 3rd harmonic (an octave plus a fifth up, which would retune a sample 5 to 7 semitones wrong):

1. A frame only accepts an early CMND dip if it is nearly as deep as the global best, so a loud harmonic's shallow dip cannot beat the true fundamental's deeper one.
2. Frames vote on a pitch class (confidence-weighted) and only the winning class feeds the final median.
3. A substantial vote a fourth above the winner is treated as the true root and preferred.

## Stack

- React + TypeScript + Vite, `vite-plugin-pwa` for offline installability.
- `jszip` for reading and writing `.koala` archives, `comlink` for the worker RPC layer.
- Web Workers: analysis (pitch and category), and render (resampling and loudness measurement).

## Koala project format notes

What this app relies on, found by inspecting real projects:

- A `.koala` file is a zip: `sampler/sampler.json` (pads and samples), `sampler/<id>.wav`, `sequence.json`, `mixer.json`, `song.json`.
- Pads have a `pad` number (0-based here; some exports may count from 1, handled via a base offset), `sampleId`, `vol` (linear amplitude), `pan` (0 to 1, 0.5 centre), `bus` (0 to 3 = A to D, -1 = Main), `color` and `label`.
- Recorded notes in `sequence.json` refer to pads by `num`, the pad number.
- Bus names, effect chains, mute, solo and volume live in `mixer.json` (`buses[]`, `master`).

## Development

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build (also generates the PWA manifest/service worker)
npx tsc -b       # type-check only
npx oxlint       # lint
npx tsx scripts/checkResample.ts    # resampler accuracy on pure tones
npx tsx scripts/checkLoudness.ts    # loudness meter and balancer sanity checks
```

Icons in `public/pwa-*.png` and `public/apple-touch-icon.png` are auto-generated placeholders (`scripts/generate-icons.mjs`).

## Using on iOS

1. Open the deployed URL in Safari.
2. Share sheet, then **Add to Home Screen**.
3. Launch from the home screen icon. After the first load it works fully offline.

## Planned

- **Finger-drumming layout:** an opt-in menu checkbox (with a layout dropdown and a Layouts preview) that arranges the kit on page A (the only page shown while it is on), everything else from page B, and fills gaps with silent placeholder pads. Tapping a pad with tuning off opens a hot-swap list of the other drums, best fit for the slot first; the drum/note toggle switches to the tuning controls. At export you choose whether drums the layout had no slot for are kept (backfilled on the last page) or deleted. There are four presets: Horizontal kit (MPC default), Quest for Groove 4x4, Mirrored kit (Xpress Pads) and Controller split for two-hand pad controllers. Slots use the classifier's types (kick, snare, clap, closed and open hat, cymbal, perc, vox, FX). **Ghost Snare** and **Soft Kick** slots are only filled at export, and only if you haven't swapped a sound into them: they then hold copies of your own snare and kick, baked 14 dB and 8 dB quieter with a gentle high cut (6 kHz and 3 kHz one-pole low-pass), rendered as separate 24-bit samples with the pad's volume knob left at 0 dB; edit `src/audio/ghost.ts` to change the levels. Recorded patterns are remapped to follow their pads. Spec and research in [docs/finger-drumming-layouts.md](./docs/finger-drumming-layouts.md); run the tests with `npm test`.
- **Bus labelling beyond the four defaults** and any per-bus settings are not handled.
- `THIRD_PARTY_NOTICES.md` still describes an earlier version of the app (Rubber Band, essentia.js); it needs a review against the current dependencies.
