# Chopping a song into patterns

For acapellas and full songs: a long sample is cut into sections along a grid the user taps out, each section becomes a pad, and each pad gets a pattern that holds its note for the section's bars, so playing the patterns in order rebuilds the song.

## Flow

The project always has the song **and its vocal stem** from Koala's stem split, the stem's pad labelled like the song's with VOCALS after it. The song is what the grid is tapped on (it is the full mix, with the beat to tap to); the vocal stem is what is cut.

1. A sample over 60 seconds gets the "Long samples" prompt on import. **Chop to patterns for acapella** sits under each sample, next to Delete (tapping it on the song or on the stem does the same).
2. **The check** (`checkStems`, `src/audio/song/stems.ts`) runs first. The stem must be a pad whose **label** in Koala is the song's label with ` VOCALS` after it (label, a space, VOCALS in capitals; case and any extension are ignored; a pad with no label is called by its sample's file name). It must also be the same length as the song to within `STEM_LENGTH_TOLERANCE_S` (30 ms): a stem whose start or end point was touched comes out a different length. If anything is wrong an alert says what to do: do the stem split in Koala and don't touch anything on the stem (its start and end points, and so on), because it has to line up with the song to the sample. Nothing opens until the check passes.
3. `SongChopModal` is one screen (v0.9.0). Nothing is cut until **Chop** is pressed, because the cuts are rendered into files and cannot be corrected afterwards.
4. Chop cuts the **vocal stem** at the cuts (`scalePlans` puts the sections on the stem's own frames if its sample rate differs) and puts section pads (`makeSectionPads`, `src/audio/songPads.ts`) on free pads: the fourth bank first, then the others from the back. As the last step **both the vocal stem's pad and the full song's pad are deleted** (the export drops their samples) and **Drum layouts is switched on with the MPC layout** (the first of `FINGER_LAYOUTS`; a layout already on is kept), so bank A is the empty kit waiting for a pack: a sample pack folder dropped on the app now (or Add pack) fills it, instead of replacing the project. Sections that find no free pad are dropped. If "tune the project to the song's key" is ticked the project key is set to the tonic (the key is found on the song in the background, `analyzeSong`, as a suggestion; the tempo and bar 1 come from the user).
   The sections are **left alone**: they are virtual pads (`Pad.section`, not `isReal`), so Organize, tuning, normalizing and Mix never touch them, and they go on no bus. Each is labelled **Vox 1, Vox 2...** (`sectionLabel` in `App.tsx`) and coloured with the palette colour it had in the chop editor, kept as hex on the pad (`section.color`, so a later palette change does not recolour it). The label and the colour are written to Koala whatever the Organize switch says. Add pack works after a chop (it does not need Drum layouts on; the ghost pads are only made with the layout on).
5. Export (`addSongSections`, `src/audio/exportSong.ts`) writes a 24-bit WAV and a pad per section (one-shot, one shared choke group, **stretch on, `stretchLength` the pattern's bars in beats**: see "Stretch" in `docs/koala-mixer-reference.md`), the patterns (`bars` long, the note held for all of them) and the project tempo (the grid's). Patterns go in the free pattern slots; `autoPlay: "next"` chains them.

## The editor

The tempo and bar 1 come from the automatic detection (`analyzeSong`, run in the worker when the editor opens; `baseGrid` in `src/audio/song/chopMarks.ts`). If no beat is found a plain 120 BPM grid is used and the downbeat markers do the work.

The waveform (`ChopTimeline`, `src/components/ChopTimeline.tsx`) scrolls behind a **cursor line fixed in the middle**. Dragging is Ableton style (`zoom.ts`): sideways drags the waveform and the point under the finger stays under it; dragging **down zooms in and up zooms out** (the same ratio for every equal step, after a 24 px dead zone), so there are no zoom buttons. The line stays in the middle and is **pulled onto the nearest grid line or marker** when one is within 10 px (`magnet`), at any zoom; while the song plays there is no magnet. The grid and the waveform are drawn from the same view, so they move together. Beat lines are light, bar lines stronger; lines closer than 7 px are not drawn.

- **Play / Pause** plays from the cursor with a **click on every beat, always on** (higher on the first beat of a bar), the waveform scrolling under the cursor. Pause leaves the cursor where it stopped. Touching the waveform to scrub pauses. The **Click** slider sets the click volume (the gain follows the square).
- **Chop marker** puts a cut at the cursor, snapped to the nearest **bar line** (`barLineNear`). The sections are the bars between neighbouring cuts (`sectionsBetween`), listed with their length in bars and given the palette colours in order. Audio before the first cut and after the last is not kept. A section over 16 bars (`MAX_SECTION_BARS`) is flagged and Chop stays disabled until a cut is added inside it. Tapping a section in the list moves the cursor to its start.
- **Downbeat marker** says a bar starts at the cursor (moved onto the sharpest attack within 20 ms). `gridWithMarks` starts a new stretch of the grid at the marker, same tempo, so every line after it sits on the marker until the next one. It only **locks the grid in**: it does not say where the song's bar 1 is, and never starts a section.
- **1.1.1** sets where the bars are counted from (also on the sharpest attack within 20 ms, and it locks the grid there too). It can sit before the first downbeat marker, so the grid can be locked in later in the song and 1.1.1 set afterwards in the intro. Setting it also puts a **chop marker** on it, and it is the **first chop marker**: chops before it do not count and cannot be added (the first section starts on it); moving or removing the 1.1.1 moves or removes that chop with it, and a chop you place there by hand stays. Until it is set, the detection's own bar 1 stands; once set it replaces it, and bars before it count back from it.
- Pressing a marker button where one already is **removes it** (a chop on the same bar line; a downbeat or the 1.1.1 within a quarter of a beat). **Undo** and **Redo** step through everything placed (`History` in `chopMarks.ts`).
- Markers are kept as the frames they were placed on and the grid and the cuts are worked out from them, so a downbeat marker or 1.1.1 added later re-snaps every chop to the corrected bar lines.

The tap-tempo editor (tapping the beat, microphone knocks, the drift check, nudging single lines) was taken out at v0.9.1; it is in the history at v0.8.3.

## Exactness

`planSections` rounds every section's two ends from the lines' exact positions, so sections picked end to end share a frame and nothing is lost or doubled (tested frame by frame, also with a nudged line, a fractional beat and a tempo change). A section's `bars` is its length in whole bars, at least one, for its pattern; one that is not a whole number of bars is still cut where the lines are, held for the nearest whole bars, and the summary says which (`oddSections`). Audio outside the sections is not kept. The project tempo the export writes is the grid's at the first section's first line (`bpmAt`); a section that crosses a tempo change is still cut where the lines are.

## A locked layout

The editor panel has a fixed size (`.chop` in `App.css`), every line of text above the controls sits in a slot of fixed size (the note is always two lines, the readout two single lines cut off rather than wrapped), and scroll chaining and text selection are off inside it, so nothing moves or resizes while a finger is on the waveform. Check this when adding to the editor.

## Limits

The chop is not remembered across a page reload (the song pad comes back from the project file). Chop and export in one go. Between downbeat markers the grid is rigid: a live drummer who drifts needs a marker where it goes out. The marker arithmetic is tested; the editor's touch handling has not been tried on a phone yet.

The older editor (detected tempo and bar 1, draggable markers that refined the grid, snap on/off) is in the history at v0.5.6.
