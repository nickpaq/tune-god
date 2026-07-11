# tune-god

A local-first web app that helps musicians tune sample batches to match a "master" loop's key — entirely on-device, installable to an iOS home screen, no uploads.

## What it does

1. **Analyzes a master loop** — detects its key (root + major/minor), tempo (BPM), and its own tuning offset from A440.
2. **Computes a white-key target pitch** — samples are tuned so that, once mapped to middle C in a DAW, the white keys play the detected key: major keys tune samples to the tonic (the C key plays the root), minor keys tune samples to the relative major root (tonic + 3 semitones), which lands the minor tonic on the **A** key — e.g. an F minor loop tunes samples to Ab, so pressing A plays F and the white keys play F minor.
3. **Analyzes a batch of samples** — detects each sample's root note and (optionally) tempo.
4. **Tunes and time-stretches** — pitch-shifts each sample onto the target pitch class (formant-preserving), and time-stretches samples flagged as loops to the master's BPM. Samples flagged **Drum** are left untouched.
5. **Lets you preview, override, and export** — per-sample preview playback, a reference tone generator at the target root frequency, individual WAV downloads, or a ZIP of the whole batch.

All decoding, analysis, and DSP run in Web Workers via WebAssembly and the Web Audio API — nothing is ever sent to a server.

## Stack

- React + TypeScript + Vite, `vite-plugin-pwa` for offline installability.
- [essentia.js](https://mtg.github.io/essentia.js/) (WASM) for key detection (`KeyExtractor`) and BPM (`RhythmExtractor2013`).
- A custom YIN pitch tracker for per-sample fundamental/tuning detection (no model weights to ship — keeps the installed app small on iOS's tight storage quota).
- [Rubber Band Library](https://breakfastquay.com/rubberband/) (WASM) for pitch-shifting and time-stretching.
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
