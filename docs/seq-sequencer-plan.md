# Current direction: Koala-backed recording and independent piano tracks

This section supersedes conflicting prototype decisions below. Implementation is in progress; the older UI remains a prototype.

- Keep `.koala` as the project file. Present eight pattern slots (1–8) for each bank and each independent piano track, then compile the arrangement into one long Koala pattern using native note timing, pitch, velocity, and length. Preserve imported note properties and automation when editing.
- Banks A–D are pad tracks. Selecting a pad provides normal pad play, velocity levels, or Piano assignment.
- A Piano assignment removes that pad from normal bank triggering, displays it greyed out there, and gives it a separate sequencer lane, pattern selector, gain and mute. Bank mute must not silence the independent piano lane.
- Keyboard C represents the sample's selected tuning root; chromatic offsets and major-scale shapes are relative to that root. Match the reference key proportions using TuneGod's visual style.
- Keyboard touches own their first key until pointer release/cancel; finger movement never changes the note. Mono means monophonic musical playback, independent of stereo channels. In Mono, a second held note glides the current voice over the selected time; releasing it returns to the most recently held note. Glide is disabled in polyphonic mode. One-shot ignores release and disables Glide; Mono plus One-shot immediately cuts the previous voice. Polyphonic held notes play simultaneously. Attack controls onset fade; Decay controls release fade (25 ms default); Glide Time controls pitch transition duration. Do not force sample endings to align.
- Recording, overdubbing, velocity mode and Undo should follow the requested iMaschine 2 workflow. Undo groups each completed recording pass. Velocity mapping awaits clarification.
- Save all played notes against the original sample's Koala pad number. The user explicitly chose one long pattern for saving. Flatten section selections into chronological notes; a lane with no selected pattern contributes no notes. Preserve unrelated imported patterns.
- “No pattern” is section-local silence for that lane. Section combinations do not consume separate Koala pattern slots.
- Sequence mode alone uses the reference layout; exiting restores the current interface. Pads retain TuneGod appearance and bank colours, with reference sizing and placement. Horizontal gestures browse all eight patterns. Single-tap enables a pattern for the scene; tapping that selected pattern again sets No pattern in scene without deleting the stored pattern. Record becomes Undo while recording; Play ends recording and keeps the take. Pattern taps no longer invoke Undo. Undo discards all notes in the active take and keeps recording a fresh take. Play commits the take and continues playback.
- Short patterns repeat across longer sections (one bar repeats eight times alongside eight bars). Sections automatically match their longest active pattern. The shortening menu offers only Keep first half and Keep last half.
- The shared sample screen is reachable through the waveform icon from both Pad and Piano modes, editing the same selected pad. Add per-pad high-pass and low-pass filters alongside waveform, volume and voice controls. Bake filters into exported samples, retaining source audio for TuneGod editing. Use cascaded Butterworth sections for a smooth, steep response. Both filters use 48 dB/octave (8-pole). Add adjustable sampler colour with independent Warmth and Bit-depth reduction toggles; neither is required for the filters. Enabled colour processing is also baked into export. RX950 is a sonic reference; exact proprietary emulation is not claimed.
- Route sequencer banks and independent piano lanes through one master soft clipper; the user accepts that master processing need not carry over to native Koala playback. Browser-native Web Audio, not Apple Audio Units.
- Full-screen Velocity view for a selected chopper pad shows chop points as colour-only tiles (no waveforms), in source order, using the Period editor colour mapping. Taps trigger the selected chop at fixed velocity. Use horizontal swiped pages for overflow.
- Step mode opens a piano roll for a keyboard instrument; other instruments use an eight-step-per-row editor, adding rows as pattern length grows. Quantize mapping, bank versus selected-pad scope, and piano-roll gestures await clarification.
- Halftime remains a separate effect: bounce to an empty melodic-loop pad, retain the source, and label BPM and bars.

---

# SEQ: sequencer page, plan

Status: focused live pad/keyboard audio test is wired; the original full sequencer UI remains a prototype. The drawings are in `docs/seq-designs/` (HTML boards, `seq.css` and PNG screenshots, `png/seq-ui-sheet.png` has all seven pages). Every number below that is a latency figure is a target to measure, not a measurement.

## Live velocity and repeat controls

Velocity stays on the left and Note Repeat on the right, each occupying half the available width. The panel-swap proposal is superseded. Remove the horizontal note-division strip. Rates rise vertically from 1/4, 1/4T, 1/8, 1/8T, 1/16, 1/16T, 1/32, 1/32T, 1/64 to 1/64T. Velocity triggers one hit per touch. From Piano, use the last selected keyboard note. Include these controls in the latency build. Entry does not trigger sound. Hold the repeat panel to play; lift to stop repeats. Velocity movement changes the next hit without retriggering. Every repeat trigger is BPM-grid quantized. A held lower division sets chunk size; a briefly pressed faster division latches one full chunk at the next lower-rate boundary before returning to the held division (1/16 + brief 1/64 gives four hits). Releasing the lower division does not erase an unfinished chunk: a new hold on a different division waits for the previous chunk to end before switching.

## Preloading and stress tests

Preload the current bank, prioritizing its selected sample, before accepting live hits. The user authorized exceeding 32 MB for stress testing. The test screen exposes 32/64/128/256 MB limits (128 MB initial), clears playback cache on exit, and shows prepared memory plus preparation time. Use the shared interactive-latency context. Phone touch-to-sound latency must be tested on-device; browser automation checks correctness only.

## Latency milestone

User requested live pads and keyboard first. Sequence currently opens a focused live-playback test screen; recording and arrangement controls remain deferred until latency testing. Next stages: recording testing, then a BPM-aligned continuous acapella/sample lane above the sequencer spanning all sections.

## 1. What SEQ is

A fourth mode key (TUNE, TYPE, SWAP, **SEQ**). Pressing it swaps the whole screen for the sequencer (transport, pattern strip, pads, banks, bottom nav). The **Back** key, first in the transport row where Koala has Stop, returns to the other modes. It edits the same pads and the same four banks as the rest of the app, and writes patterns into `sequence.json` in the Koala export, so what is played in the app is what Koala loads.

Pages (bottom nav and transport): **Play** (pads + OLED readout), **Vel** (default and live-play velocity, input quantize), **Pattern** (patterns 1 to 4, length, clear, double, step mode, erase, mute, undo, redo, history), **Edit** (the selected pad: tune, gain, pan, one-shot, choke, reverse, colour), **Sounds** (the hot-swap list), plus **Tempo** (timing: quantize, swing, humanize, metronome; the BPM is the project BPM from the menu) and **Mixer** (four bank strips, FX1/FX2 sends, mute) from the transport row. Bank D in SEQ is the keys page (piano on the selected pad), as in Koala.

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

## 7. Decisions so far

- **Back replaces Stop** in the transport row; there is no left-edge tab.
- **Editing is one sample at a time.** The Velocity, Keys pitch and Edit pages act on the selected pad only. Playing stays multi-touch (kick and hat together is normal); a voice cap of about 24 to 32 with oldest-first stealing protects the CPU.
- **Latency is judged by a measured test**, not assumed: `/latency-test/` (branch `latency-test`) plays a hard-attack sound on touch so a screen recording with the mic shows touch to sound. Run it installed on the phone, on the phone speaker.
- **Ableton Link cannot be done in a web app** (no local network sync access). The row is drawn disabled on the Tempo page and should be removed unless a native shell is ever used.

## 8. Limits of a web app on iOS (the installed app uses the same WebKit audio as Safari)

- The audio buffer size cannot be chosen (`latencyHint` is only a request) and `outputLatency` may not be reported, so recording needs a user-set offset (a tap-along calibration).
- Bluetooth output adds 150 to 250 ms or more and cannot be detected; play live on the phone speaker or wired headphones.
- Using the microphone changes iOS audio routing and can add delay; recording pad taps (events, not audio) avoids this.
- The silent switch can mute Web Audio unless the audio session type is "playback".
- Calls, Siri and locking the screen interrupt audio; nothing plays in the background, and a touch is needed to resume.
- Memory is the sleeper risk: decoded audio is about 23 MB per stereo minute at 48 kHz, and the project size limit defaults to 512 MB.
- No Web MIDI on iOS Safari, no audio interface choice, no haptics, and the display may be capped at 60 Hz.
- If measured latency is too high: tune inside the web app first (warm-up, short lookahead, calibration offset), then consider a native shell (Capacitor) with a native audio plugin for live hits.
