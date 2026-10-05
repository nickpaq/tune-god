# Chopping a song into 8-bar patterns

For acapellas and full songs: a long sample is cut into 8-bar sections, each section becomes a pad, and each pad gets a pattern that holds its note for the 8 bars, so playing the patterns in order rebuilds the song.

## Flow

1. A sample over 60 seconds gets the "Long samples" prompt on import. **Chop to patterns for acapella** sits under each sample, next to Delete.
2. `SongChopModal` finds tempo, bar 1 and key (in the analysis worker, `analyzeSong` in `src/audio/song/beats.ts`) and shows them as suggestions. Nothing is cut until **Chop** is pressed, because the cuts are rendered into files and cannot be corrected afterwards.
3. Chop replaces the song's pad with section pads (`makeSectionPads`, `src/audio/songPads.ts`) on free pads: the fourth bank first, then the others from the back. Sections that find no free pad are dropped. If "tune the project to the song's key" is ticked the project key is set to the tonic.
4. Export (`addSongSections`, `src/audio/exportSong.ts`) writes a 24-bit WAV and a pad per section (one-shot, one shared choke group, cloned from the song's own pad), the patterns, and the project tempo. Patterns go in the free pattern slots (an empty one has `notes: null`); `autoPlay: "next"` chains them. The project's `beatsPerBar` is kept (or the editor's, when changed).

## Exactness

`planSections` (`src/audio/song/chop.ts`) rounds every cut from its exact grid position, never from the previous cut, so nothing drifts and the sections tile the song with no gap and no overlap (tested frame by frame). A section is always exactly 8 bars (a cut moved by hand keeps that length); the last one is padded with silence. A downbeat before the start of the file pads the first section with silence. Audio before bar 1 is not kept.

## Detection

- Tempo: autocorrelation of the spectral-flux onsets (bass band weighted in, so hats between the beats do not double the tempo), then a straight-line fit through the onset nearest every predicted beat. Accurate to a fraction of a BPM on a steady song, not on one that drifts.
- Bar 1: beat phase is reliable; which beat is beat 1 is a guess (bass weight), then snapped onto the sharpest attack within 30 ms. The editor's note says when to check it.
- Key: chroma from prominent spectral peaks (tuning-corrected) against Krumhansl profiles. A bare triad can read as its relative minor or major.
- All of this is tested on synthetic songs only. Check real music against the grid before trusting it.

## Editor

`SongChopModal` is drawn in the OLED's colours (black, the screen ink, Silkscreen headings) but not on its pixel grid, so the waveform is full quality. `ChopTimeline` shows about half the song at rest (`defaultSpan`), with every cut as a tab along the bottom whose top comes to a point. Constants to tune are at the top of `src/audio/song/zoom.ts` (`MIN_SPAN_FRAMES`, `MIN_ZOOM_ROOM_PX`) and `ChopTimeline.tsx` (tab size, `RETURN_MS`).

- Grab a tab and drag **down** to zoom in: the span goes from the resting one to the closest along a geometric curve (`spanAt`), the way the pitch slider's slowdown works, so there are no steps. Travel is half the way to the bottom of the screen from where the finger grabbed.
- The tab stays under the finger (`dragStep`), and a pixel of sideways travel covers `span / width` frames, so the further in, the finer the placement. At the closest zoom one pixel is about a frame.
- Let go: the cut stays where it was put and the view eases back out to the resting zoom, keeping the tab at the same place across the screen. Dragging anywhere else pans; the arrows page half a view.
- Cut 1 is bar 1: moving it moves the whole grid. Any other cut moves alone (`SongGrid.shifts`, frames from where the grid puts it), and still lasts exactly 8 bars, which leaves a gap or an overlap with its neighbours. This is for a song that drifts off its tempo. **Fit tempo to this cut** sets the tempo so the grid passes through bar 1 and the chosen cut; **Reset cut** puts a moved cut back on the grid.
- **A bar missing (or added).** A song does not always keep to 8 bars: a pre-chorus can drop a bar. When a cut is let go almost exactly one to seven bars (within 0.08 of a bar) from where the grid has it, `settleCut` takes that as the song's structure: the section before it is that many bars shorter (or longer, up to 16), every later cut moves with it (`SongGrid.bars`), and the small remainder stays a shift. That section's audio is exactly that many bars, and its pattern is that many bars long with the note held for all of them (`SongExport` section `bars`). A cut that is merely a bit off the grid (a drifting tempo) stays a small shift. **Reset cut** also undoes the structure change a cut caused; dragging a cut back to where the grid had it restores the 8 bars.
- Nudge buttons (-10 ms, -1 and +1 frame, +10 ms) and **Snap** (nearest attack) act on the chosen cut. **Play with clicks** plays two bars from it with a click on every beat.
- **Taps and centring.** Tapping a tab (the finger goes no further than `TAP_SLOP_PX`, 8 px) selects it, moves nothing and brings it to the middle of the view; a drag only starts once the finger passes that, and carries on from where it is, with no jump. The arrows under the waveform choose the previous or next chop point and centre it (they stop at the first and last). The view may run past either end of the song by half its width (`clampViewStart`), so bar 1, often a second in, can be centred and zoomed in on.
- **Playing** (the big button under the waveform, owned by `ChopTimeline`): **hold** to play; it fades out when let go, the way a pad does (`PadHandle.release`). **Slide down** before letting go to lock it on (`LATCH_DRAG_PX`); press again to stop. Playback starts at the marker. The beat **clicks** (toggle beside the button) are scheduled a quarter second ahead of the playhead.
- **A marker held while playing is the playhead.** Press play with a second finger while one holds a marker: playing starts at the marker, its line stays in the middle of the view whatever the finger does (the finger can still zoom by moving down), and the waveform scrolls under it. When playing stops the marker keeps the place it got to (committed with `onMoveCut`), slides from the middle back under the finger, carrying the waveform with it (`settleUnderFinger`, an exponential approach, `SETTLE_TAU_MS`), and then the drag carries on from there. Pressing play again, finger still down, starts from the marker's new place. If the finger is lifted while playing, the cut is placed (and settled for structure changes) when playing stops, and the view eases back out.
- Playing with no marker held (from the chosen cut) leaves the marker where it is: a playhead line runs along the waveform and the view returns to where it was afterwards.
- The waveform comes from a min/max pyramid (`src/audio/song/waveform.ts`), so a 7-minute song draws in full at every zoom without scanning the audio.

## Limits

The chop is not remembered across a page reload (the song pad comes back from the project file). Chop and export in one go.
