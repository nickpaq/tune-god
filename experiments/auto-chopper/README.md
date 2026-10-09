# Auto Chopper beat-detection lab

This is an isolated experiment. The app's production detector and Chopper UI are unchanged. Open `public/auto-chopper-lab/index.html` directly in a browser, or visit `/auto-chopper-lab/index.html` on this branch's preview deployment. It is a self-contained HTML file: no npm installation, CDN or upload server is needed to use it. The audio stays local. The page works offline after downloading it.

## Test flow

1. Choose an audio file. All methods receive the same decoded mono audio and analyze the full file. Music Tempo is resampled to 44,100 Hz as its upstream API requires. Web Audio Beat Detector receives the upstream 240 Hz low-pass filter. There is no extra amplitude normalization.
2. Select each automatic result, play the audio and listen against the accented click. Seek to later sections to check drift. The native competitor beat origins are not musical downbeat classifications.
3. If the grid is off, pause and drag the waveform to any known downbeat: the first beat or the beginning of a later sequence after an intro. Use the 1 ms nudge buttons or enter an exact time. Marker placement does not snap to a grid or attack.
4. Press **Use playhead as downbeat & rerun all methods**. The app reruns every detector on the audio from that marker to the end, preserving the original automatic results. The assisted grid's origin is exactly the marker; it extends backwards through the intro. This common wrapper is not a native manual-marker feature of either competitor. One anchor fixes phase, not proof of tempo. Excluding the intro can change each tempo estimate.
5. Compare at the start and later in the song, choose the best method and download the JSON report. Reports include the filename, sample rate, marker, BPM, origins, drift segments, native Music Tempo beat times, timings and listening notes. No audio is included.

The original TuneGod baseline is expandable below the three main results. A demo reproduces an offbeat-hat phase failure in that original detector. It is not evidence of superiority on real recordings.

## What the inspected code does

Baseline: TuneGod commit `26d2c61a6509cdd27dcccd9a7cb36f022387107c` (v0.40.12).

`src/audio/song/beats.ts` downsamples audio, measures spectral changes, estimates tempo from whole-spectrum and bass autocorrelation, fits a beat grid, chooses bar phase from bass-weighted beat strengths and finds a sufficiently strong first bar. The initial spectral frame was excluded from onset measurement. Tempo estimation includes bass, but `fitBeatGrid` originally fits only the full-spectrum flux. Loud offbeat hats can therefore win the grid's phase while BPM remains correct. `playingAtStart` selects the first *estimated bar line*, not necessarily zero.

`SongChopModal.tsx` then constructs the grid, applies saved markers and calls `correctDrift`. That correction uses the first-downbeat transient as a template and follows similar hits to correct tempo/relock segments. It does not independently recover the correct bar phase. The lab includes that pass for both TuneGod variants and exports the initial BPM separately. Files whose first marker is at zero cannot provide the 3 ms pre-roll required by the existing drift corrector, which consequently returns no matches; the initial whole-song regression still estimates tempo.

Saved markers are keyed by label, frame count and sample rate. Existing 1.1.1/downbeat markers can override fresh automatic results. The lab starts without saved markers to isolate the detector. This can explain differences from a previously edited song, but the actual user's recurring file has not yet been examined.

## Experimental corrections

`beatsExperimental.ts` is a copy isolated from the production code, changing:

- Include positive spectral changes in the first frame, compared to silence.
- Fit grid phase/period using independently normalized bass and full-spectrum evidence, with bass weight 2.5, so loud hats have less influence.
- Prefer a credible bass onset near the file boundary only when it agrees with a fitted beat within 30 ms. Preserve genuine leading silence using the initial attack's sample position instead of snapping blindly to zero.

Bass weights and the boundary heuristic remain experimental. An extremely loud offbeat-hat case still fails. Syncopation, pickup notes, fades, variable tempo and ambiguous bar phase need real-file evaluation. No claim of a universally perfect grid is made.

## Competitor source revisions and licenses

Vendored sources are pinned, with no runtime network dependencies:

- [Music Tempo](https://github.com/killercrush/music-tempo), revision `0cbef63b57dbb2342394d3534776d6202c250ba9`: upstream browser distribution, unchanged, under MIT (`vendor/music-tempo-LICENSE`). Its native tempo tracker estimates beats, not musical downbeats. Results use the native reported tempo and first tracked beat.
- [Web Audio Beat Detector](https://github.com/chrisguttandin/web-audio-beat-detector), main-package inspection revision d794f2e6e7f1175781758147c9efae5fb2704dae. Vendored algorithm from worker revision `4c23a8fce7806fc2edd755dc4ccfcdfa3a10c752`, plus the preprocessing behavior from broker revision `35414c1e653fd300da8835bacc9a41fd621b3732`, under MIT (`vendor/web-audio-beat-detector/LICENSE`). The upstream worker helpers are transpiled, not rewritten. The lab uses native OfflineAudioContext instead of standardized-audio-context to reproduce its low-pass preprocessing. It calls upstream `guess()` with defaults (90–180 BPM), retaining its rounded BPM and phase offset. Unrounded tempo is included in the report.
- TuneGod and derived experiment code use this repository's GPLv3 license. All license texts are embedded in the standalone HTML.

These libraries are established alternatives, not independent musical-downbeat classifiers. Their automatic bar accents are explicitly provisional; the user marker provides the known 1.

## Rebuild and verification

Requires Node 24. No external build dependencies:

```sh
node experiments/auto-chopper/build.mjs
node experiments/auto-chopper/detectors.test.mjs
```

The builder strips TypeScript with Node's built-in API, vendors the original and corrected TuneGod methods, the unchanged Music Tempo bundle, Web Audio Beat Detector helpers and existing drift correction into a classic worker, then embeds everything into a standalone HTML. Generated assets: `detectors.worker.js` (regression-test harness) and `public/auto-chopper-lab/index.html` (browser artifact). Rebuild before running tests after detector edits.

Browser checks use Chromium at the repository's 402 × 874 viewport. Verified flow: WAV input → native decode/filter/resampling → worker results for all four methods → rendered BPM/phase → click playback → exact manual anchor at 4 s → automatic result preservation → clearing assistance. No backend or credentials are required. Console errors: none; horizontal overflow: none. Node checks reproduce the original offbeat phase failure and verify corrected regression cases, leading silence, manual anchor and silence rejection.

Main is not updated by this branch. After listening tests, the improved detector can be ported into the production module in a separate reviewed change; the lab's HTML and vendored competitors do not need to ship in the final app.
