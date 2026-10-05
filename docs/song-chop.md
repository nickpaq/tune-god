# Chopping a song into 8-bar patterns

For acapellas and full songs: a long sample is cut into 8-bar sections, each section becomes a pad, and each pad gets a pattern that holds its note for the 8 bars, so playing the patterns in order rebuilds the song.

## Flow

1. A sample over 60 seconds gets the "Long samples" prompt on import. **Chop to patterns for acapella** sits under each sample, next to Delete.
2. `SongChopModal` finds tempo, bar 1 and key (in the analysis worker, `analyzeSong` in `src/audio/song/beats.ts`) and shows them as suggestions. Nothing is cut until **Chop** is pressed, because the cuts are rendered into files and cannot be corrected afterwards.
3. Chop replaces the song's pad with section pads (`makeSectionPads`, `src/audio/songPads.ts`) on free pads: the fourth bank first, then the others from the back. Sections that find no free pad are dropped. If "tune the project to the song's key" is ticked the project key is set to the tonic.
4. Export (`addSongSections`, `src/audio/exportSong.ts`) writes a 24-bit WAV and a pad per section (one-shot, one shared choke group, cloned from the song's own pad), the patterns, and the project tempo. Patterns go in the free pattern slots (an empty one has `notes: null`); `autoPlay: "next"` chains them. The project's `beatsPerBar` is kept (or the editor's, when changed).

## Exactness

`planSections` (`src/audio/song/chop.ts`) rounds every cut from its exact grid position, never from the previous cut, so nothing drifts and the sections tile the song with no gap and no overlap (tested frame by frame). A section is always exactly 8 bars; the last one is padded with silence. A downbeat before the start of the file pads the first section with silence. Audio before bar 1 is not kept.

## Detection

- Tempo: autocorrelation of the spectral-flux onsets (bass band weighted in, so hats between the beats do not double the tempo), then a straight-line fit through the onset nearest every predicted beat. Accurate to a fraction of a BPM on a steady song, not on one that drifts.
- Bar 1: beat phase is reliable; which beat is beat 1 is a guess (bass weight), then snapped onto the sharpest attack within 30 ms. The editor's note says when to check it.
- Key: chroma from prominent spectral peaks (tuning-corrected) against Krumhansl profiles. A bare triad can read as its relative minor or major.
- All of this is tested on synthetic songs only. Check real music against the grid before trusting it.

## Editor

Two zoomed waveform views with the beat grid, bar 1 and the last section. Drag the waveform until the sound sits on the line: the first view moves bar 1, the second changes the tempo (bar 1 stays). Nudge buttons are -10 ms, -1 and +1 frame, +10 ms; Snap goes to the nearest attack; "Play with clicks" plays two bars from either view with a click on every beat.

## Limits

The chop is not remembered across a page reload (the song pad comes back from the project file). Chop and export in one go.
