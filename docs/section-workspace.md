# Song section workspace (v0.41.0)

Open **Load Bank D: Chopper → Chopper mode**, choose audio, check the detected tempo and bar 1 in the existing alignment editor, then choose **Open section workspace**. The ordinary marker editor and its acapella/synced paths remain available.

The workspace shares one waveform surface between **Song cuts** and **Pattern maker**. Choose exactly one of 4, 8, or 16 bars. Swipe down to later source sections, up to earlier ones. In Song cuts, drag horizontally in sixteenth-note steps and tap to place a cut. Two successive cuts create an existing chop and set the proposed piece length. In Pattern maker, Source sections offers the corresponding offset in each other section. With no confirmed piece it uses the cut cursor's offset; subsequently it follows the last chosen source piece's endpoint, including any intervening silence. Existing chops offers the prepared collection, ordered by its position in the four-bar phrase.

Swipe left to confirm. Swipe right to progressively shorten the last piece; after consuming it, another 72 CSS pixels arms removal, with resistance in the visual movement. Release commits the change. Undo restores the preceding cuts/chop collection/sequence. The Length control adjusts the candidate before confirmation. Silence appends a gap. Keyboard arrows and the Place cut / Confirm buttons provide alternatives to gestures.

Hold to play stops on release, cancellation, lost capture, focus loss, or hiding the app. Browsing auditions play at a constant rate, independent of finger speed. Preview Join starts four sixteenth-note steps (one quarter note) before the confirmed sequence ends, then plays the candidate without committing it. Sequence plays the assembled slots, including silence. A line shows the browsing/editing position; a dot shows AudioContext playback time. If a key offset is applied to the chopper, preview uses the same fixed pitch/speed ratio as Koala.

**Done** checks a trial Koala export before keeping the arrangement. Select the chopper pad and choose **Edit chop pattern** to reopen it during this app session. Saving a versioned native project and session restoration of the full original source are future work; export the Koala project before closing the app.

## Timing and export

- The existing spectral-flux BPM detector, separate downbeat phase detection, manual anchors, and drift correction remain authoritative. The section workspace takes a snapshot of that grid on opening. Later source sections use their corrected frame positions rather than accumulating a tempo from frame zero.
- Musical note starts and lengths remain integer sixteenth-note steps. Audio starts search for a quiet crossing within 1 ms, shared across channels, with 2 ms boundary fades. This does not move the notes off the grid or alter the original source arrays.
- An arrangement's overlapping source choices are packed into independent slices of a new 24-bit WAV. Repeated choices of the same chop and length share a slice. This prevents another chosen source boundary from ending a longer Koala slice prematurely, and avoids overwriting audio referenced by another pad.
- Up to 127 distinct pieces are supported. An arrangement exceeding that limit fails explicitly rather than truncating it. Silence leaves a note gap. Notes retain the measured velocity-to-slice mapping, pitch 0, and 1024 ticks per sixteenth. ONE SHOT is off so note lengths gate playback. Pattern duration is rounded up to whole bars, as required by the existing exporter; a partial final bar leaves trailing silence in Koala.

## Verification and remaining device check

`npm test`: 327 tests passed, including eight section/audio model tests and a real calibration-project export test. `npm run build` passed. `npm run lint` passed with three pre-existing hook warnings in ChopTimeline.

Chromium at **402 × 874** verified audio import, cuts, left-swipe commit, right-swipe trim/removal and undo, downward source browsing, hold release, Preview Join scheduling measured at 0.5000002 seconds of lead-in for 120 BPM, complete sequence playback, Done, and downloading a Koala archive. With simulated 59 px top / 34 px bottom insets, the workspace remained 874 px tall without overflow, the canvas was 218 px tall, and Done ended at y=840. These inset values were test inputs only, not production layout constants. The downloaded archive contained the expected two independent slices, two notes, a silence gap, and a stereo 24-bit WAV at the source sample rate.

On the installed iPhone app, check real reported safe areas, reserved edge/home gestures, scroll speed, interrupted touches, audio unlocking, background/foreground transitions, and reduced motion. In Koala, open and render an arrangement with overlapping source choices, a one-sixteenth piece, silence, and a repeated piece. Compare its timing and boundary clicks to the app's Sequence and Preview Join. These checks require the actual device and Koala; desktop Chromium cannot establish iOS behavior or Koala's rendered audio.
