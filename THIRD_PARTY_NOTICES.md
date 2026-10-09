# Third-party notices

This project bundles the following libraries. Their upstream licenses govern the corresponding code/WASM binaries.

## Rubber Band Library (`rubberband-wasm`)

- Used for: pitch-shifting and time-stretching (`src/audio/stretch/rubberband.ts`).
- License: **GNU General Public License**. Commercial closed-source distribution requires a separate license from Breakfast Quay — see https://breakfastquay.com/rubberband/license.html.
- Because of this, this repository is distributed under the GPL as well (see `LICENSE`). If you need to relicense, `src/audio/stretch/rubberband.ts` is written as a narrow, swappable interface specifically so an alternative engine (e.g. an MIT-licensed one) can replace it without touching the rest of the app.
- Source: https://github.com/breakfastquay/rubberband (WASM build via https://github.com/Daninet/rubberband-wasm)

## essentia.js

- Used for: key detection and BPM detection (`src/audio/key/essentiaKey.ts`).
- License: **AGPL-3.0**.
- Source: https://github.com/MTG/essentia.js

## Other dependencies

React, Vite, `vite-plugin-pwa`, `jszip`, and `comlink` are used under their respective permissive (MIT) licenses — see each package's `node_modules/<package>/LICENSE` for details.

## Music Tempo (`music-tempo`, 1.0.3)

- Used for: the Music Tempo option in the waveform view, running its beat tracker in an analysis worker on mono audio resampled to 44,100 Hz.
- License: **MIT**, copyright (c) 2017 killercrush.
- Source: https://github.com/killercrush/music-tempo
- License text: `node_modules/music-tempo/LICENCE`.

## Web Audio Beat Detector (`web-audio-beat-detector`, 8.2.39)

- Used for: the Web Audio Beat Detector option in the waveform view, with its native low-pass preprocessing and background worker.
- License: **MIT**, copyright (c) 2026 Christoph Guttandin.
- Source: https://github.com/chrisguttandin/web-audio-beat-detector
- License text: `node_modules/web-audio-beat-detector/LICENSE`.

Both options find beat timing, not the musical first beat of a bar. The existing 1.1.1 and downbeat markers provide manual bar alignment; the first known marker also excludes preceding audio from detection.
