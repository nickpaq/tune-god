# Live pad and keyboard latency test

Version 1.1.0 adds a focused Sequence test screen. Full recording and arrangement editing remain deferred until phone latency testing.

1. Import a Koala project through the existing importer.
2. Open Seq (or Menu → Sequence · latency test). Wait for Preparing samples to finish.
3. Choose a bank and touch a loaded pad; the sound begins on touch-down.
4. Open Piano to play that selected sample. C uses its tuning root; other keys apply chromatic offsets. Sliding a held finger must not trigger neighbouring keys. Black keys are as wide as white keys; all touch targets remain within their visible key boundaries. Equal-area geometry is awaiting the final clarification. The keybed is bottom-aligned within the available area.
5. Open Waveform for the same sample's Mono, One-shot, Glide, Attack, Decay and Glide time controls. Glide requires Mono and One-shot off. While gliding, release the newer key to return to an older held key.
6. In Waveform, compare preload limits of 32, 64, 128 and 256 MB. Prepared memory and preparation time are displayed. The current bank is prepared first, prioritizing the selected pad. Playback buffers are released on exiting Sequence mode. Larger-than-budget sounds are prepared on demand.
7. Open Velocity: its left half triggers one hit at the touched velocity; dragging changes the next hit without retriggering. Hold the right half for note repeat, from 1/4 at the bottom to 1/64T at the top. Coming from Piano, both use its last selected note. Entering this view is silent.
8. Use Back to return to the original interface. Stop cuts all test voices.

Test the first hit after entry as well as repeated hits and two-finger chords. Use the phone speaker or wired output for the initial comparison, and report Bluetooth results separately. A recording showing the finger touching the screen and capturing the speaker is useful for measuring response.

Desktop automation verifies pointer ownership, voice counts, glide scheduling, no horizontal overflow at 402 × 874, and absence of runtime exceptions. It does not establish phone touch-to-speaker latency.

Synthetic stereo sample preload measurements in Chromium: 32 MB limit prepared 29.3 MB in 147 ms; 64 MB prepared 61.5 MB in 350 ms; 128 MB prepared 126.0 MB in 717 ms; 256 MB prepared 254.9 MB in 1451 ms. These values are machine-specific. Clearing the cache returned retained playback-buffer usage to zero. Original decoded sample memory, playing voices and browser overhead are additional to this cache limit.

Halftime is also available from Menu. Audio files can be loaded directly; Koala files open in the project importer, then an existing pad can be dragged onto the Halftime option. Bouncing writes processed audio to a free melodic-loop pad, preserves its source, and adds BPM/bars to the label. A full melodic-loop area prompts for an unlocked destination to replace.
