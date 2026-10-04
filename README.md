# KoalaTune (tune-god)

A local-first web app for [Koala Sampler](https://koalasampler.com) projects. Drop in a `.koala` file, pick a key on the on-screen piano, and the app tunes the right pads to it, balances their loudness, colours and labels them, routes them to buses, and lets you rearrange them. Then it exports a new `.koala` file ready to open in Koala. Everything runs on-device in the browser; nothing is uploaded. It installs to an iOS home screen as a PWA and works offline after the first load.

## Features

### Loading and analysis
- Drop a `.koala` project (or tap to choose one). Every pad's audio is read at its **native sample rate and bit depth** (16/24/32-bit PCM and float WAV), with no resampling on load. Stereo is preserved end to end.
- Each pad is analysed on a background worker: a custom YIN pitch tracker finds the root note, and a classifier guesses the sound category.
- The last project, your per-pad choices and your pad arrangement are remembered between visits.

### Sample packs
Drop a **folder of samples** on the drop zone (or tap **Choose a pack folder**) instead of a `.koala` file. Each audio file (wav, aiff, flac, mp3, ogg, m4a) is classified from its folder names, nearest folder first: "Snares", "808s", "Open Hats", "Toms", "Crashes", "Risers" and so on are folded into the fifteen sound types (rules in `src/audio/samplePack.ts`), folders that only group files ("One Shots", "Drums") are skipped in favour of the next one out, and the file name is the fallback, then Other. The drum kit is loaded first: for every sound type the finger-drumming layout has slots for (kick, snare, clap, hats, cymbals, perc, vox, FX), one sound goes on each slot and **ten more are kept hidden** for each of those types as hot-swap options (`PACK_ALTERNATIVES`). The other banks are laid out by type: **bank B** holds eight melodic loops (its top two rows) and then eight melodic one-shots (pianos, plucks, bells and the like, by the same classification as everywhere else); **bank C** holds two basses and two 808s (all four classified as bass; a sound is an 808 when its name or folder says 808, and a shortage of one kind is made up from the other), then shares its other twelve pads evenly between every remaining type (drum loops, perc loops, other); and **bank D is left empty** for your own sounds, such as recordings. Melodics and bass load before loops, so a tight memory budget runs out on the loops first; a loop pad that cannot fit the size limits stays empty rather than being filled with another type. Each of those types keeps four hidden alternatives, and a bass pad's swap list leads with its own kind (808s for an 808 pad). **Add pack** (a button in the menu, available while the finger-drumming layout is on) adds another sample pack folder to the project you have. It keeps everything exactly as it is and only fills what is missing: the silent placeholders and gaps in banks A to C (so a drums-only pack imported first can have its melodics, bass and loops filled from a second pack, or the other way round; a ghost snare or soft kick slot gets its copy once its snare or kick arrives), never bank D, and it tops up the hot-swap pool with spares of any type that is short. New sounds are levelled against the sounds already in the project, count against the memory budget with the project's size, and are written into the saved project; adding a pack clears undo history. The hidden sounds are on no pad: select a pad and the swap menu lists the hidden alternatives of that pad's type first (a drum slot also offers the other drums). Swapping puts the new sound on the pad and the old one back in the menu, so you can swap again or undo. **Re-typing a sound** in a pack (in the sound type drawer or the pad panel) moves it off its pad into the swap pool as a sound of its new type, so a snare found among the Other sounds and re-typed as a snare shows up in the swap list whenever a snare is selected; a spare of the pad's old type takes its place, so each area of the pads keeps its sounds (with no spare left, the pad becomes a silent placeholder). The export drops every sound that is not on a pad, so only the sounds you left on the pads end up in the `.koala` file. Hidden sounds are numbered from pad 64 in the project, past the grid, and are saved with the project when it is reopened. The picked sounds are zipped into an ordinary project, so tuning, balancing and export work as usual and the folder-based types are kept in place of the classifier's guess.

A pack import also does the housekeeping as it goes. Every picked sound is measured, the common loudness is worked out for the whole set, and each is then decoded again, gain-matched (same K-weighted balance as **Balance loudness**, -1 dBFS ceiling) and written into the project as 24-bit WAV, with the mix level for its type on the pad's volume knob. So the project only ever holds the processed sound, with no untouched copy kept for undo, and preview plays pads at their knob level rather than holding a second normalized copy. When the sounds have been analysed, **Balance loudness** and **Auto-color pads by sound type** are switched on and the **finger-drumming layout** is applied (kit on bank A, the rest from B), with undo history starting clean. Both can still be turned off in the menu.

Only file names and sizes are read before picking, so a huge pack costs nothing until the chosen sounds are loaded. The loaded files are held to a byte budget, and no single file may take more than a sixth of it; a file that would not fit is passed over for another of its type. Browsers can't report free memory (Safari reports nothing), so **Sample pack memory** in the menu offers Low (96 MB), Auto and High. Auto is a guess from the device (`packByteBudget` in `src/audio/samplePack.ts`): 192 MB on iPhone and iPad, scaled by Chrome's reported device memory elsewhere. High doubles it (384 MB on iOS), so you can find where a device gives out. Decoded audio takes about three times the file size in memory.

### Sound categories
Fifteen categories, from filename keywords first and then simple acoustic features (length, decay, spectral balance, detected pitch): **Kick, Snare, Clap, Closed Hat, Open Hat, Cymbal, Vox, Perc, FX, Bass, Melodic, Drum Loop, Perc Loop, Melodic Loop, Other**. Crash, ride and other cymbals are Cymbals (the hat tone), and an unnamed hat ringing over 1 s counts as one; toms, shakers and tambourines count as Perc; chants and breaths are Vox. A hat with no open/closed keyword in its name is called open when it rings longer than 0.3 s. A name containing "loop" turns its category into the loop version ("perc loop" is a Perc Loop); breaks and amens are Drum Loops; unnamed samples over 4 s are Melodic Loops if pitched and Drum Loops otherwise.  If you re-type a sound that sits on the finger-drumming page so it no longer fits its slot, a sound of the slot's type from a later page takes its place (or a missing-pad gap if there is none). Categories drive tuning, colour, labels, loudness trims and bus routing.

Change a pad's category with the **Type** key (top left): the deck under the screen turns into fifteen sound type keys in five columns, each with a lamp in its palette colour; the chosen one is pushed in and its lamp lit. The screen names the pad's type and sample, its key and shift, and shows its waveform. Tap a pad to see or change its type. The types follow the order drums (kick, snare, clap, closed hat, open hat, cymbal, vox, perc, drum loop, perc loop), then melodic, melodic loop, bass, FX and other.

### Long samples
A sample longer than 60 s makes export very slow, so importing a project that contains any shows a warning listing them, with play and delete buttons for each (or keep them all). The limit is `MAX_SAMPLE_SECONDS` in `src/App.tsx`.

### Tuning
- **Hot-swap and tuning modes.** Three mode keys at the top left (**Tune**, **Type**, **Swap**) choose what the screen and the deck under it do. With the finger-drumming layout on, **Swap** is the resting mode: the screen shows the **hot-swap list** for the selected pad, slim OLED rows each with just the sound's name (the file name with its extension, track number and bracketed tags removed, so "03 - [clap] Luxury Clap.wav" reads "Luxury Clap"; a pack tag that many of the project's sounds start with, as in "Rio - Bell Perc", is left out too, so it reads "Bell Perc"), a play button and a swap button, and the deck is hidden so the list gets the room. The list scrolls on its own, without moving the locked page. **Tune** shows the pad's note, tune switch, shift, waveform and the pitch trim slider, with the piano on the deck. Without the layout there is no hot-swap list, so Swap is disabled and the screen starts on Tune.
- On the **Tune** deck, pick a note on the piano octave; tapping the key that is already selected switches tuning off and every sound reverts to its original pitch, so the keyboard is both a selector and an on/off switch. Beside the piano sit the **Tone** key and an **All / One** key: in One, a tapped key applies only to the selected pad (tapping its key again switches that pad's tuning off), and All applies it to every pad again.
- The selected pad's waveform is drawn on the screen above its pitch trim slider.
- Pads classified Bass, Melodic or Melodic Loop with a detected pitch are tuned to it by default, decided by the classifier alone (everything else is left alone). Koala's own stretch setting on a pad is never changed. You can toggle Tune per pad, and manual choices survive key changes.
- Each pad has one pitch trim slider, ±12 semitones in 1-cent steps (a custom precision slider, so iOS Safari behaves). Grab it and the thumb follows your finger one to one; the further down the screen your finger goes, the finer it gets, smoothly, until at the very bottom of the screen a sweep across the whole track is exactly one semitone. Double-tap resets it.
- **Tone** plays a reference sine on the chosen key alongside a pad for ear-checking.
- Tapping a pad plays it held and looping, retuning live as you move sliders. Live preview uses the browser's playback-rate change for instant response.
- **Export uses a much higher quality repitch:** a 256-tap Kaiser-windowed sinc resampler (about 140 dB stopband, 4096 interpolated kernel phases, double-precision accumulation). Measured on pure tones the error is about -145 to -150 dB and the response is flat through 19 kHz. The repitch is a sampler-style resample, so duration and formants shift with pitch and transients stay crisp. `scripts/checkResample.ts` reproduces the measurements.
- Resampled audio is only scaled down, and only if a peak would pass -0.1 dBFS, so exports never clip.

### Loudness balancing ("Balance loudness" + "Normalize now")
- Every sample is measured with ITU-R BS.1770 K-weighting (the LUFS filter), taking its loudest 200 ms window so short one-shots and long loops compare fairly. `scripts/checkLoudness.ts` checks the meter against the standard's reference values.
- Files are gain-matched to the same perceived loudness with a **-1 dBFS peak ceiling**. The common level is the highest one at which about 90% of samples fit under the ceiling; the few peakiest are held at the ceiling. A peak (knob trim included) is also held to within 8 dB of that common level, so short transients like snares can't peak far above everything else. The kick is the exception: it sits 3 dB above the common level with 5 dB more peak room (hip-hop). Hats and cymbals get less: 4 to 5 dB less peak room, because their short, bright hits read quiet on the meter and would otherwise be lifted until they peak level with the snare.
- The **mix** goes on each pad's volume knob as a per-category trim (kick 0 dB, snare and bass -1, clap -2, vox, drum loops and other -3, perc -4, melodic -4, hats -6, cymbals -7, FX -6, perc and melodic loops -5; editable in `src/audio/loudness.ts`). Koala's knob is linear amplitude (`vol = 10^(dB/20)`, verified against a real project), so a knob at 0 dB plays the normalized file at its full level.
- **Normalize now** renders the same balance for playback, so pad taps are level-matched while you work. With the checkbox on but the button unpressed, balancing happens only at export.

### Colour and labels
- **Auto-color pads by sound type** writes a colour and a label to every pad on export, and the same label shows on the pads in the app. Drums show their category (Open Hat, Clap), other sounds show a filename keyword (Piano, Pluck, Riser, Vox, 808) and fall back to the category name. See `src/audio/padLabels.ts`. In a project built from a sample pack the exported label is instead exactly the caption on the pad in the app (without its number), including the "add Kick" and "Ghost Snare" captions of the layout's other pads. Seven palettes (Organ, the default, then Koala, Studio, Pastel, Neon, Midnight, Grayscale), each with its own arrangement of hues so they read as different schemes; in every one snare, cymbal and perc sit well apart (a test enforces it). **Organ** is taken from the rocker tabs of a 1970s home organ: drums run red through orange into yellow, loops are greens, and melodic sounds, bass, FX and other run from pink through orchid and indigo to slate; its colours are hand-picked per sound type. The others each hold ten base tones (kick, snare/clap, hats, perc/vox, FX, bass, melodic, other, drum and perc loops, melodic loop) and categories in one tone are shades of it, so snare and clap read as a family while kick stands apart. They are built in OKLCH (`src/audio/palettes.ts`), so within a palette every tone has the same lightness and colourfulness, and each colour has the same job in every palette: kick red, snare rose, FX magenta, perc and vox violet, bass deep indigo, melodic blue, melodic loops azure, hats light cyan, drum loops green, Other a cool grey. Because shading turns oranges, ambers, yellows and olives muddy, those six palettes leave them out; Organ uses them unshaded. The palette also colours the pads' underlight and the sound type tabs in the app. Pick one from **Color palette** in the menu, which previews each palette laid out like the sound type keys.

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
- Undo and redo are the first two keys of the transport row under the pads. Covers pad edits (tune, trims, category), key changes, pad moves, swaps and deletes. Slider drags count as one step; up to 100 steps; cleared when a new project loads.

### Export
- **Export** (the first item in the menu) bakes tuning into the audio (24-bit WAV), writes volumes, colours, labels, pans, buses and the rearrangement, and downloads `<name>_tuned.koala`. Pads you don't retune or rebalance keep their original audio byte for byte. A progress counter shows on the menu item during long renders.

### Interface
- The page is locked so it never scrolls or rubber-bands; the layout is a dark graphite chassis drawn in CSS that scales to any width: grey keycaps with orange LEDs, a black OLED in Silkscreen (pixel font) on a 3 px pixel grid, glowing pads in a black well, and Barlow Semi Condensed for everything else. The fonts are bundled (`@fontsource`), so the app still works offline. The design and its spec are in [docs/graphite-barlow-redesign-spec.md](./docs/graphite-barlow-redesign-spec.md).

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

The icon is the koala (with a cigarette in each nostril, like a narwhal's tusks) in `public/favicon.svg`; `public/pwa-192.png`, `public/pwa-512.png` and `public/apple-touch-icon.png` are the same art as full-bleed squares, rendered from that SVG without its rounded frame (`scripts/generate-icons.mjs` is an old placeholder generator and would overwrite them with a plain "T"; do not run it).

## Using on iOS

1. Open the deployed URL in Safari.
2. Share sheet, then **Add to Home Screen**.
3. Launch from the home screen icon. After the first load it works fully offline.

## Planned

- **Finger-drumming layout:** an opt-in menu checkbox (with a layout dropdown and a Layouts preview) that arranges the kit on page A (the only page shown while it is on), everything else from page B, and fills gaps with silent placeholder pads. Tapping a pad with tuning off opens a hot-swap list of the other drums, best fit for the slot first; the drum/note toggle switches to the tuning controls. At export you choose whether drums the layout had no slot for are kept (backfilled on the last page) or deleted. There are four presets: Horizontal kit (MPC default), Quest for Groove 4x4, Mirrored kit (Xpress Pads) and Controller split for two-hand pad controllers. Slots use the classifier's types (kick, snare, clap, closed and open hat, cymbal, perc, vox, FX). **Ghost Snare** and **Soft Kick** slots are only filled at export, and only if you haven't swapped a sound into them: they then hold copies of your own snare and kick, baked 14 dB and 8 dB quieter with a gentle high cut (6 kHz and 3 kHz one-pole low-pass), rendered as separate 24-bit samples with the pad's volume knob left at 0 dB; edit `src/audio/ghost.ts` to change the levels. Recorded patterns are remapped to follow their pads. Spec and research in [docs/finger-drumming-layouts.md](./docs/finger-drumming-layouts.md); run the tests with `npm test`.
- **Bus labelling beyond the four defaults** and any per-bus settings are not handled.
- `THIRD_PARTY_NOTICES.md` still describes an earlier version of the app (Rubber Band, essentia.js); it needs a review against the current dependencies.
