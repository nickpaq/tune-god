# Slice and dice (the chopper's pattern maker, v1.1.0)

In Chopper mode's chop screen (the BPM and manual chops screen, unchanged), **Slice and dice** sits where Chop by 8 and Chop by 16 were (the other modes keep those two). The knob beside it picks the size of every piece: 1/8, 1/8T, 1/4 (default), 1/4T, 1/2, 1/2T, 1 bar. Pressing it opens the **Chop rearranger** (`SliceDice.tsx`, model in `src/audio/song/sliceDice.ts`) with one piece of that size, from the anchor if one was placed, else from the first grid step in the song.

The screen is the chop editor's own (same `chop__screen`, same canvas height). It shows the whole arrangement under a fixed centre playhead; the chop under the playhead is the selected one. Drag sideways to scrub, down to zoom in, up to zoom out (same range, ease and momentum as the waveform view). The chop under the playhead sounds as the playhead crosses into it.

- **← / →** move to the previous or next chop of the arrangement: the playhead snaps to its beginning and it plays. At the end, → does nothing.
- **▲ / ▼** give the selected chop the next (later in the song) or previous piece of the song, at its own length. Consecutive swaps on one chop are one step of Undo.
- **Next chop** pastes the next sequential piece of the song after the selected chop (the piece after the one the nearest chop plays). **Repeat** pastes a copy of the selected chop after it. **Silence** pastes a silence of the chosen size after it.
- **Randomize** gives every chop a random piece of the song, on the same beat of the bar it sits on in the arrangement.
- **Play** (toggle) plays from the chop before the selected one into it and on to the end. While engaged, scrubbing stops it for the moment and it carries on from the nearest bar; moving to another chop restarts it. **Sequence** plays everything from the beginning.
- **Repeat sequence** marks a coloured square from the bar nearest the playhead; scrub to drag its end (the bar nearest the playhead, at least a bar from its start). − / + set how many bars it is copied over; **Copy** repeats the square over those bars (the last copy cut short), overwriting what was there. Undo restores it.
- **Undo / Redo** work on the whole arrangement. **Done** checks a trial Koala export and keeps the pattern; unused pieces are dropped first.

Export is unchanged: pieces are packed into independent slices of a fresh WAV (127 per pad, bank D from pad 48, 2032 total), notes stay in one pattern, silence is a gap. Select the chopper pad and use **Edit chop pattern** to reopen the arrangement; its piece size is read from its first chop.
