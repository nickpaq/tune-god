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
