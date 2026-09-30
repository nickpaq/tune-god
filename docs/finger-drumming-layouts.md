# Finger drumming pad layouts: research and options

Status: researched and planned, not built. The same notes exist as a Claude Doc from the session that wrote them.

## Goal and constraints

An opt-in action that rearranges a loaded Koala project's pads into a layout tuned for two-thumb playing on a phone screen. Drag-and-drop swapping, the all-pads view, trash, "Unused pad" and undo/redo already exist (`src/audio/padMoves.ts`, `src/App.tsx`).

- Place sounds by category: Kick, Snare, Hat, Perc, Bass, Melodic, Vocal, FX, Other.
- Thumbs on a touch screen, not MPC-style pads: reach matters more than finger assignment.
- Colour, tuning, trims, category and all pad settings move with the sound (only `index` changes).
- Export already renumbers pads and remaps recorded sequences.

## What the research found

Kick, snare, closed hat and open hat form a core that almost never moves; the rest is flexible. Two schools exist, and no source covers thumbs on a phone.

| Layout | Where the sounds go | Source |
| --- | --- | --- |
| Horizontal (kit-like) | Kick, snare, closed and open hats on the bottom row; ghost notes and crashes above | [MPC Tutor](https://www.mpc-tutor.com/mpc-workflow-rearrange-pads-finger-drumming-kits/) |
| Vertical | Core drums in one column for the dominant hand (kick thumb, snare index, hat middle finger); frees the other hand's column and the top row for bass, chords, leads, hits | [MPC Tutor](https://www.mpc-tutor.com/mpc-workflow-rearrange-pads-finger-drumming-kits/) |
| Left-handed mirror | Core drums on the far left, hands reversed | [MPC Tutor](https://www.mpc-tutor.com/mpc-workflow-rearrange-pads-finger-drumming-kits/) |
| Quest for Groove 4x4 | Bottom: cymbal, kick, kick, cymbal. Then sidestick, snare, snare, sidestick. Then hat, open hat, hat, ride. Top: low, mid, high tom, cymbal | [Quest for Groove](https://questforgroove.com/basic-finger-drumming-technique-pad-layout/) |
| Xpress Pads mirrored | Bottom: kick, closed hat, closed hat, kick. Above: snare, open hat, open hat, snare. Toms and cymbals higher | Search summary only ([SoundOnSound](https://www.soundonsound.com/reviews/yamaha-fgdp-50)) |
| Koala with a pad controller | Bottom-left quadrant kick/snare/hats; top row or right side for chops, loops, FX | [Genx Notes](https://blog.genxnotes.com/en/koala-sampler-external-controllers/) |
| MPC default | Kick A01, snare A02, closed hat A03, open hat A04; notes 36 to 51 | Search summary only ([MPC Forums](https://www.mpc-forums.com/viewtopic.php?f=5&t=189571)) |

The "3-finger style" (kick thumb, snare index, hat middle) does not transfer to two thumbs. Quest for Groove tip: hit with a downward wrist motion, not finger pressing. Finger drumming on a touch screen is widely considered a poor experience and many players add a pad controller.

## Thumb ergonomics (own reasoning, not researched)

- Thumbs hang from the bottom corners, so the bottom two rows are the easiest.
- The top row is a stretch; top-centre is hardest.
- Each thumb owns two columns: left thumb columns 1-2, right thumb columns 3-4.
- Put the most-hit sounds on the bottom rows; less-played one-shots can go on top.
- In the app slot 1 is top-left and slot 16 bottom-right. Whether Koala's on-screen numbering matches is unverified.

## Layout options

Grids read top row first; the bottom row is under the thumbs. Banks B to D take overflow, grouped by category.

**Option 1: kit only on bank A**

| Row | Col 1 | Col 2 | Col 3 | Col 4 |
| --- | --- | --- | --- | --- |
| Top | Perc | Perc | Perc | Perc |
| 2 | Perc | Perc | Perc | Perc |
| 3 | Hat | Hat | Hat | Hat |
| Bottom | Kick | Kick | Snare | Snare |

Bass and melodic on bank B, vocals and FX on C, other on D. Cleanest drums, but bass and chords need a bank switch.

**Option 2: everything you play live on bank A (recommended, plus a mirror toggle)**

| Row | Col 1 | Col 2 | Col 3 | Col 4 |
| --- | --- | --- | --- | --- |
| Top | Melodic | Melodic | Vocal or FX | FX |
| 2 | Bass | Bass | Melodic | Perc |
| 3 | Hat | Hat | Hat | Perc |
| Bottom | Kick | Kick | Snare | Snare |

**Option 3: split hands**

| Row | Col 1 | Col 2 | Col 3 | Col 4 |
| --- | --- | --- | --- | --- |
| Top | Perc | Perc | Melodic | Vocal or FX |
| 2 | Hat | Hat | Melodic | Melodic |
| 3 | Kick | Snare | Bass | Melodic |
| Bottom | Kick | Snare | Bass | Bass |

Left thumb drums, right thumb tones. Downside: kick and snare share one thumb.

## Implementation plan

1. `src/audio/fingerLayouts.ts`: each layout is a list of category slots for bank A plus the overflow rule for banks B to D.
2. Compute the arrangement (current index to new index) from each pad's category and apply it with the existing `movePad` logic as one undo step.
3. Menu button "Arrange for finger drumming" with a layout picker and a mirror toggle (one-shot action, not a saved setting). Mirror flips columns.
4. Export needs no changes (renumbering and sequence remap exist).

## Open questions

- Which option, and mirror on or off by default?
- When a category has more sounds than slots, spill to bank B or to the nearest free bank A slot?
- Guess closed versus open hats from decay time, since names often lack the word?
- Verify Koala's on-screen pad numbering against the app's slot order.
- Sequence remap assumes note numbers use the same base as pad numbers (true for the tested 0-based project).
