# Finger drumming pad layouts: research and options

Status: built (see `src/audio/fingerDrumming.ts`, `fingerLayouts.ts`, `drumRoles.ts`, `placeholderPads.ts`). The agreed spec is in "Agreed spec" below; the layout options and implementation plan sections that precede it are the earlier research and are superseded where they disagree.

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
- In the app slot 1 is top-left and slot 16 bottom-right. Koala's own numbering matches (verified against a project it saved).

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

## Agreed spec

Supersedes the option tables above where they differ: bank A and B are drums only, and bass and melodic sounds live on banks C and D.

### Layout of the four banks

1. **Bank A** is the selected layout (a 16-slot drum layout), filled from the user's drums. A slot with no matching sound gets a `missing <role>` placeholder.
2. **Bank B is a second kit only if the drums left after bank A include at least one kick, one snare and one hat.** Then it uses the same layout, with `missing <role>` placeholders for gaps. Otherwise bank B is not arranged and has no placeholders.
3. **Melodic sounds start at bank C**, sorted lowest to highest frequency (basses first), then vocals and FX, then other. Frequency is the detected pitch when there is one; otherwise spectral centroid (the analysis worker has to return it).
4. **Overflow past bank D continues into bank B**, skipping occupied pads.
5. **Leftover drums go at the very end** of that order.
6. **Every spot still free after that gets an "Empty pad" placeholder.**

### Placeholders

- Both kinds are real pads in the exported project, each with a silent WAV, so they need a new sample entry and a pad entry when exporting.
- **Missing x**: label `missing <role>`, Koala's dark grey.
- **Empty pad**: label `Empty pad`, the app background colour `#2d111d`, so it reads as translucent. Audio is a silent WAV of 2 ms.
- Neither is ever coloured by the palette.

### Drum roles

A separate `drumRole` field, leaving the 9 palette categories alone: kick, snare, clap/sidestick, closed hat, open hat, ride, crash, low/mid/high tom, perc. Filename rules first, then decay time (open versus closed hat) and pitch (tom order). A slot takes an exact role match first, then a leftover sound of the same category, never a different category.

### Menu and previews

- A "Finger drumming layout" section in the menu: an opt-in checkbox, a layout dropdown and a "Layouts" button.
- "Layouts" opens a modal like the palette picker. Each layout shows its name and a 4x4 preview of bank A only, shown as a full kit with every slot filled and labelled with its role.
- Preview colours use the selected palette, or Koala if none is selected.

### Behaviour

- **Checking the box** shows a warning first: pads will be rearranged, recorded patterns are corrected and still play back as expected. After confirming, the layout applies live as one undo step.
- **Unchecking the box** shows a warning first: the layout and any changes made since will be lost. After confirming, all placeholder pads are removed and the arrangement from before the box was checked is restored.
- Manual drags after applying a layout stay until the layout is changed or the box is unchecked.
- The layout re-runs when pad analysis finishes, since categories arrive late.
- The checkbox and chosen layout are saved with the other settings.

### Build order

1. `src/audio/drumRoles.ts`, `src/audio/fingerLayouts.ts` and the pure arranger, with tests: full kit, partial kit, second-kit threshold on each side, overflow, leftover drums last, more than 64 pads.
2. Menu section, warnings, Layouts preview modal, undo and restore.
3. Export of placeholder pads (new sample and pad entries, silent WAVs), plus a test that remapped sequence notes land on the right pads.

### Decisions made while building

- If the project is nearly full, real sounds take over `missing` placeholder slots (last first) rather than being left out.
- When a second kit exists, bank A uses only exact role matches so the leftovers stay available for bank B; otherwise bank A may fill a slot with a same-category drum, bottom row first.
- All placeholders share one silent sample in the exported project.
- The checkbox is disabled while pads are still being analysed; the layout is per project (a newly loaded project starts with it off), and the chosen layout is remembered.
- Switching layouts while one is applied asks for confirmation and rearranges from the current pads; unchecking restores the pre-layout slots for every pad still in the project.

### Verified

- Koala numbers pads from 0, row by row from the top left (pad 0 is top left of bank A, 15 bottom right of A, 63 bottom right of D), matching the app's slots. Checked against a project saved by Koala (`docs/fixtures/pad-numbering.koala`). Pad numbers are stored as strings there, and an empty sequence has `notes: null`; both are handled.

### Still to verify

- Opening an exported project in Koala. Placeholder pads now match the structure of a project Koala saved itself (`docs/fixtures/pad-numbering.koala`), but no exported file has been opened in the app yet.
- The exact Koala dark grey (`MISSING_PAD_COLOR` in `placeholderPads.ts` is an approximation).
- That sequence remap holds with the extra pads (note numbers use the same base as pad numbers, true for the tested 0-based project).
