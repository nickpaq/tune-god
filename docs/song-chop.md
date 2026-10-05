# Chopping a song into patterns

For acapellas and full songs: a long sample is cut into sections along a grid the user taps out, each section becomes a pad, and each pad gets a pattern that holds its note for the section's bars, so playing the patterns in order rebuilds the song.

## Flow

The project always has the song **and its vocal stem** from Koala's stem split, the stem's pad labelled like the song's with VOCALS after it. The song is what the grid is tapped on (it is the full mix, with the beat to tap to); the vocal stem is what is cut.

1. A sample over 60 seconds gets the "Long samples" prompt on import. **Chop to patterns for acapella** sits under each sample, next to Delete (tapping it on the song or on the stem does the same).
2. **The check** (`checkStems`, `src/audio/song/stems.ts`) runs first. The stem must be a pad whose **label** in Koala is the song's label with ` VOCALS` after it (label, a space, VOCALS in capitals; case and any extension are ignored; a pad with no label is called by its sample's file name). It must also be the same length as the song to within `STEM_LENGTH_TOLERANCE_S` (30 ms): a stem whose start or end point was touched comes out a different length. If anything is wrong an alert says what to do: do the stem split in Koala and don't touch anything on the stem (its start and end points, and so on), because it has to line up with the song to the sample. Nothing opens until the check passes.
3. `SongChopModal` has two stages, **tap the tempo** and **pick the cuts**. Nothing is cut until **Chop** is pressed, because the cuts are rendered into files and cannot be corrected afterwards.
4. Chop cuts the **vocal stem** at the cuts (`scalePlans` puts the sections on the stem's own frames if its sample rate differs) and replaces the stem's pad with section pads (`makeSectionPads`, `src/audio/songPads.ts`) on free pads: the fourth bank first, then the others from the back. The song's own pad stays. Sections that find no free pad are dropped. If "tune the project to the song's key" is ticked the project key is set to the tonic (the key is found on the song in the background, `analyzeSong`, as a suggestion; the tempo and bar 1 come from the user).
   The sections are **classified as vocals** (category `vox`): they are labelled with the song's title, the app's vocal label and the number, `Toxic Vox 1`, `Toxic Vox 2`... (`sectionLabel` in `App.tsx`); with Organize on they take the vocal colour, and with Mix on they go to the vocal bus. With those off, the stem pad's own colour and bus are kept.
5. Export (`addSongSections`, `src/audio/exportSong.ts`) writes a 24-bit WAV and a pad per section (one-shot, one shared choke group, **stretch on, `stretchLength` the pattern's bars in beats**: see "Stretch" in `docs/koala-mixer-reference.md`), the patterns (`bars` long, the note held for all of them) and the project tempo (the grid's). Patterns go in the free pattern slots; `autoPlay: "next"` chains them.

## Stage 1: tapping the tempo

The song plays (Play starts it from the middle of the view) and the user taps along, either with the big **Tap** button or with the **microphone** (Mic on: a knock on the back of the phone, which is steadier than a button that can miss a press). The grid is not placed by detection: it is whatever the taps say.

- **Taps are times in the song.** A button press is read from the pointer event's own timestamp (the song has moved on while the event waited in the queue). The song's position is the audio clock less the output's delay (`outputLatency`, else `baseLatency`), so a tap lines up with what was *heard* (`useSongPlayer`, `frameNow`/`frameAgo`). Whatever delay is left (a Bluetooth speaker, say) is put right with **Whole grid** in stage 2.
- **One bad hit is ignored** (`estimateTempo`, `src/audio/song/tapTempo.ts`). The estimate is a straight line through the beats the taps land on (least squares: slope is the beat, intercept the phase). A tap is believed only if it lands within 0.2 of a beat of where the line says a beat is (0.3 for the first five); anything else (a stray hit, a bounce under 0.2 s, a slip) is **ignored** and the tempo carries on. A missed beat is fine: the line just skips a number. If three taps in a row all disagree with the line but agree with each other (steady within 25 %), the player has really changed tempo and the line is made again from them. A stray hit among the first two taps can make the line twice as fast as the music, with every real tap on every other line; when the believed taps keep a steady gap of two or more lines the line is made again from just those taps. The ignored taps are drawn as small dots under the waveform, the believed ones as ticks.
- **Locked in** is 12 believed taps within 0.06 of a beat (rms) of the line (`LOCK_TAPS`, `LOCK_RMS`). **Lock the grid** is enabled from 8 (`MIN_TAPS`): it makes the grid from the taps (`gridFromTaps`) and goes to stage 2. The grid is arbitrary until then: it starts where the first believed tap was.
- **The microphone** (`startMicTaps`, `src/audio/song/micTap.ts`) opens the mic with echo cancellation, noise suppression and automatic gain **off** (they flatten a knock) through a `ScriptProcessor` of 512 samples (works everywhere the app runs, no worker file). `TapDetector` (`tapDetector.ts`) high-passes at 600 Hz, follows the level, and calls a tap a level that jumps over the running average of the last half second by a ratio (8 down to 2.5 as **Sensitivity** goes up) and over a floor, with a 120 ms refractory time so a knock that rings is one tap. A steady song from the speaker raises the average and is not a tap; the knock close to the mic is much louder. The meter shows the level so the sensitivity can be set by eye. Headphones keep the song out of the mic altogether. Not tested on a real device yet.

## Stage 2: picking the cuts

`TapGrid` (`src/audio/song/tapGrid.ts`) is a row of numbered **lines**, one per beat, at a steady spacing (`beatFrames`) from `originFrame`, plus **offsets** for lines nudged by hand. A **cut** is a line number. The first cut is bar 1; **bar lines** (stronger) count from it (`isBarLine`; before a cut is picked every line is a beat). Three modes, chosen under the waveform:

- **Pick cuts**: tap a line to cut there (the first is bar 1, then each split); tap a cut again to take it away. Cuts are numbered flags along the top; the sections between them are shaded in turn.
- **Adjust grid**: tap a line that sits off the beat to choose it (a diamond at its foot), then nudge it: -10 ms, -1, +1, +10 ms, **To transient** (onto the sharpest rise within 30 ms), **Reset line**. Only that line moves; the cut on it goes with it. **Whole grid** moves every line together (`shiftGrid`), for taps that always land a little early or late.
- **Drag section**: drag from one line to another and a cut is made at each end (`addCuts`). Both ends snap to the nearest drawn line; the view runs on by itself near the edges (`EDGE_PX`).

Other controls: Remove last cut, Clear cuts, **Tap again** (back to stage 1; clears the cuts, which would no longer mean the same lines, after a confirm), beats per bar, and **Rest of the song after the last cut** (on: the last cut starts one more section to the end, padded with silence to whole bars; off: the last cut only ends the section before it).

`GridTimeline` (`src/components/GridTimeline.tsx`) draws the waveform (a min/max pyramid, `waveform.ts`, so a 7-minute song draws in full at every zoom) with the lines, cuts, the tap marks and the playhead. Drag pans (except in Drag section mode); the buttons under it page and zoom (the view is about 8 bars at first). Lines closer than 7 px are not drawn, beats first and then bars, and cannot be picked: zoom in. A tap picks the nearest drawn line within 18 px. Play from the middle of the view with **Play**; **Clicks** puts a click on every line (higher on bar lines) so the grid can be heard against the song, and follows nudges.

## Exactness

`planTapSections` rounds every cut from the line's exact position, and a section runs from one cut to the next, so neighbouring sections share a frame and nothing is lost or doubled (tested frame by frame, also with a nudged line and a fractional beat). A section's `bars` is its length in whole bars, at least one, for its pattern; one that is not a whole number of bars is still cut where the lines are, held for the nearest whole bars, and the summary says which (`oddSections`). The rest of the song, when wanted, is padded with silence to whole bars at the grid's tempo and left out if less than `MIN_TAIL_SECONDS` of the song is in it. Audio before the first cut is not kept. A cut before the start of the file pads the first section with silence. The project tempo the export writes is the grid's spacing (`gridBpm`).

## A locked layout

The editor panel has a fixed size (`.chop` in `App.css`), every line of text above the controls sits in a slot of fixed size (the note is always two lines, the readout two single lines cut off rather than wrapped), and scroll chaining and text selection are off inside it, so nothing moves or resizes while a finger is on the waveform. Check this when adding to the editor.

## Limits

The chop is not remembered across a page reload (the song pad comes back from the project file). Chop and export in one go. A grid is rigid: a live drummer who drifts needs the lines nudged one by one. Everything here is tested on synthetic taps and signals only; the microphone path and the tap latency have not been measured on a phone.

The older editor (detected tempo and bar 1, draggable markers that refined the grid, snap on/off) is in the history at v0.5.6.
