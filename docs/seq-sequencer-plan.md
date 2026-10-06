# SEQ: sequencer page, plan

Status: UI drawn (design canvas "KoalaTune SEQ"), nothing built in the app yet. Every number below that is a latency figure is a target to measure, not a measurement.

## 1. What SEQ is

A fourth mode key (TUNE, TYPE, SWAP, **SEQ**). Pressing it swaps the whole screen for the sequencer (transport, pattern strip, pads, banks, bottom nav). A tab at the left edge returns to the other modes. It edits the same pads and the same four banks as the rest of the app, and writes patterns into `sequence.json` in the Koala export, so what is played in the app is what Koala loads.

Pages (bottom nav and transport): **Play** (pads + OLED readout), **Vel** (default and live-play velocity, input quantize), **Pattern** (patterns 1 to 4, length, clear, double, step mode, erase, mute, undo, redo, history), **Edit** (the selected pad: tune, gain, pan, one-shot, choke, reverse, colour), **Sounds** (the hot-swap list), plus **Tempo** (BPM wheel, tap, swing, quantize, metronome) and **Mixer** (four bank strips, FX1/FX2 sends, mute) from the transport row. Bank D in SEQ is the keys page (piano on the selected pad), as in Koala.

## 2. Safe areas

The SEQ screen is drawn inside the band between the two lines where the screen's corner curve starts: top **62** and bottom **812** (the page height measured on the installed iOS 26 app, see CLAUDE.md). Nothing is drawn outside that band; the chassis colour fills the top and bottom strips behind the island and the home indicator. In code that is the existing `--safe-top` and `--safe-bottom` (`useSafeArea.ts`), not new numbers. The pad block is the one flexible element (`flex: 1`), so a shorter phone loses pad height, not controls.

## 3. Latency: where it is lost and what we do

| Path | Source of delay | Plan |
| --- | --- | --- |
| Touch to pad sound | `click` waits for touch end; React render before audio; creating nodes on the hit | Use `pointerdown` on `touch-action: none` pads. In the handler call `start()` on a pre-built voice and only then touch the UI. No `setState` before the sound: the pad lights by toggling a class on the element directly, React state catches up on the next frame. |
| Voice start | `AudioBufferSourceNode` + gain + pan created per hit; buffers decoded or built lazily | Decode every pad to an `AudioBuffer` when it loads (`bufferFor` in `player.ts` already caches). Keep a per-pad gain and pan node permanently wired; create only the source node on the hit (it is cheap and one-shot). |
| Context | Suspended context on iOS; default latency hint | One shared context created with `latencyHint: "interactive"`, resumed on the first touch, kept running. Play a silent buffer once so the first real hit is not the first start. |
| Sequencer clock | A `setTimeout` loop on the main thread jitters under layout and GC | Clock in a **Worker** (timers are not throttled there) posting ticks; each tick schedules every note that falls inside a short lookahead window (about 50 ms) with `source.start(audioTime)` on the audio clock. Notes are sample-accurate because they are scheduled, the timer only has to be early. Step up to an AudioWorklet clock only if measurements show worker jitter above the lookahead. |
| Recording | Touch time and sound time differ by the output latency; the pad is heard late | Take the time from `event.timeStamp`, map it to audio time once per gesture, subtract `outputLatency` (and `baseLatency`) so a hit lands where it was heard to be played, then quantize (Quantize switch, 1/4 to 1/32). Store in Koala ticks (4096 per beat) so no rounding happens at export. |
| Playhead and UI | Per-step React renders at 60 to 120 steps a second | The playhead, step lamps and scene bars are driven by one `requestAnimationFrame` loop that reads the audio clock and writes to refs and CSS variables. React re-renders only on edits, never on playback. |
| Pad layout | Re-flow when the OLED text changes height | The OLED readout is a fixed-height block; text is sized in the existing cells (`--c`). |

Measure before tuning: add a dev overlay that prints `baseLatency`, `outputLatency`, and the time from `pointerdown` to `start()` (should be under 1 ms of JS). Test on an installed iPhone, not only desktop Chromium, and with the ring/silent switch on.

## 4. Data model

Patterns are four per scene lane, up to 32 sequences in the file, in Koala's own shape (`docs/koala-mixer-reference.md`, the `sequence.json` paragraph): notes `{num, vel, start, length, timeOffset, ...}` in ticks of 4096 per beat. In the app keep them in typed arrays per pattern (pad, start tick, length, velocity) sorted by start, so the scheduler walks a pointer instead of searching. Undo, redo and History are a list of pattern snapshots (copy on write); Double repeats the notes into the second half and doubles `numBars`. The scheduler reads a pattern, never the UI state.

## 5. Build order

1. Mode key and empty SEQ screen with the safe-area band, the transport row, the bottom nav and the Play page (pads, OLED readout), all from the drawn UI, still silent. Screenshot-check against the canvas.
2. Pad hit path (`pointerdown`, pre-built voices) and the latency overlay. This benefits Tune too.
3. Clock in a Worker, lookahead scheduler, play and stop, tempo, metronome, loop.
4. Record with latency compensation and quantize; Pattern page (length, clear, double, erase, mute, undo and redo).
5. Velocity page (default velocity, live play capture), Edit page (writes `pad.*` fields that already export), Mixer page (bus gains: the four buses already exist in `mixerChain.ts`).
6. Export: write the patterns into `sequence.json`; play the exported project in Koala and compare timing with the in-app playback.
7. Keys page on bank D (scale lamps, chord), Step mode, Ableton Link is out of scope (the row is drawn disabled).

Each step ships on its own behind the SEQ key and bumps `package.json` `version` when users can see it.

## 6. Open questions

- Bank D is the chops' bank (CLAUDE.md): the keys page plays the selected pad chromatically and must not write sounds into bank D.
- Whether the in-app mixer edits the Mix preset values or only the session (the preset object is the single source of sound-shaping numbers).
- Exact corner-curve positions on other phones: the 62 and 812 lines are for the 402 x 874 pt phone that was measured.
