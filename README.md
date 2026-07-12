# tune-god

A local-first web app that helps musicians tune sample batches to match a "master" loop's key — entirely on-device, installable to an iOS home screen, no uploads.

## What it does

1. **Analyzes a master loop** — detects its key (root + major/minor), tempo (BPM), and its own tuning offset from A440. If the filename already names the key/BPM (e.g. `pad_C_min_120.wav`, `classics_Am.wav` — spaced, delimited, and lowercase forms all parse), that takes priority over detection, with a manual override on top.
2. **Computes the target pitch**, in one of two modes:
   - **Match master loop** (default) — the master's audio is left completely untouched. Every sample is tuned to the master's literal tonic, then detuned by the master's own offset from true pitch, so samples match the loop's actual (possibly imperfect) sound.
   - **Correct everything to A=440** — the master loop is also retuned, precisely onto its detected tonic at an editable, standard-range A4 reference pitch (415–466 Hz), and samples are tuned to that same clean reference — so everything, master included, ends up at true pitch.
3. **Analyzes a batch of samples** — detects each sample's root note and tempo, and guesses a per-sample mode from its filename/duration/pitch confidence (always overridable):
   - **Loop** — tuned and time-stretched to the master's BPM via Rubber Band, preserving exact duration and formants.
   - **One-shot** — tuned via a windowed-sinc resample (pitch-shift by changing playback speed, no Rubber Band). Duration drifts slightly with pitch and formants shift with it too, but transients stay crisp instead of getting smeared by a phase vocoder — the classic sampler-pitch-knob approach, better suited to plucked/percussive one-shots like pianos.
   - **Drum** — left completely untouched.
4. **Lets you preview, override, and export** — per-sample preview playback, a reference tone generator at the target root frequency, individual WAV downloads, or a ZIP of the whole batch.
5. **Round-trips Koala projects** — drop a `.koala` file to use its first pad as the master and tune the rest; the rebuilt project swaps in the tuned pad audio (pitch knobs zeroed — tuning is baked into the audio), writes the master's BPM into the transport, and locks Koala's keyboard to the master's scale (Major/NaturalMinor) so the on-screen keys match the key everything was tuned to.

All decoding, analysis, and DSP run in Web Workers via WebAssembly and the Web Audio API — nothing is ever sent to a server.

## How detection works

Two different detectors, on purpose — "what key is this loop in" and "what note is this one-shot" are different problems:

- **Master key** — essentia.js's `KeyExtractor` run as an **ensemble of four key profiles** (`edma`, `bgate`, `temperley`, `krumhansl`) with a strength-weighted vote. Each profile has different failure modes (edma alone is biased toward minor), so the vote is far more reliable on parallel major/minor confusion than any single profile. Reported confidence is scaled by how much of the ensemble agreed. Filename key labels, when present, still win over detection.
- **Per-sample root pitch** — a custom YIN tracker, hardened against the classic YIN failure of locking onto a note's 3rd harmonic (an octave *plus a fifth* up — octave errors are harmless to pitch-class tuning, but the fifth would retune a sample 5–7 semitones wrong). Three layered defenses:
  1. A frame only accepts an early CMND dip if it's nearly as deep as the global best, so a loud harmonic's shallow dip can't beat the true fundamental's deeper one.
  2. Frames vote on a pitch class (confidence-weighted) and only the winning class feeds the final median, so a minority of harmonic-locked frames can't drag the result off-root.
  3. A substantial vote a fourth above the winner is treated as the true root (of which the winner is the 3rd harmonic) and preferred.

## Stack

- React + TypeScript + Vite, `vite-plugin-pwa` for offline installability.
- [essentia.js](https://mtg.github.io/essentia.js/) (WASM) for key detection (`KeyExtractor`, four-profile ensemble — see above) and BPM (`RhythmExtractor2013`).
- A custom YIN pitch tracker for per-sample fundamental/tuning detection (no model weights to ship — keeps the installed app small on iOS's tight storage quota), with the harmonic-locking defenses described above.
- [Rubber Band Library](https://breakfastquay.com/rubberband/) (WASM, R3 "Finer" engine with formant preservation) for the master loop and Loop-mode samples' pitch-shifting/time-stretching; a windowed-sinc resampler (32-tap Hann-windowed, phase-tabled, cutoff scaled on upward shifts so nothing aliases) handles One-shot mode instead. Processed audio returns from the render worker via zero-copy transfer.
- `jszip` for batch export, `comlink` for the worker RPC layer.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for licensing details — Rubber Band is GPL-licensed.

## Development

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build (also generates the PWA manifest/service worker)
```

Icons in `public/pwa-*.png` and `public/apple-touch-icon.png` are auto-generated placeholders (`scripts/generate-icons.mjs`) — swap in real artwork before shipping.

## Using on iOS

1. Open the deployed URL in Safari.
2. Share sheet → **Add to Home Screen**.
3. Launch from the home screen icon — after the first load, it works fully offline.

## Not yet built

- Automatic drum/percussive classification. For now, use the manual **Drum** toggle per sample to skip tuning.
- Cross-reload persistence of a loaded batch (by design — everything lives in memory for the session and is meant to be processed and exported, not stored).
