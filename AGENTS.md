# TuneGod working instructions

Read CLAUDE.md for the existing implementation and design constraints.

## Required UI verification

User instruction: **ALWAYS COMPARE BEFORE AND AFTER PICTURES WHEN EDITING THE UI.**

Before changing UI, capture screenshots of the affected screens. After changing UI, capture the same screens with the same data, state, viewport and device scale, and inspect both images side by side. Verify at least 402 × 874 and 402 × 762, device scale factor 3. Check that existing controls remain visible, reachable and usable, including the full tuning slider; a build passing does not establish that the UI fits. Fix clipping or overlap before finishing. Retain the screenshots as review artifacts and report the comparison.

## Required scrolling exceptions

The app deliberately blocks page-level touch scrolling in `src/main.tsx` so the chassis stays fixed on screen. **Every scrollable UI region must have an explicit exception in that touchmove handler**, either directly or through an allowed scrollable ancestor. When adding or changing any list, menu, modal or panel, verify its exception, bounded height, overflow and `touch-action`. Test real touch swipes to reach the bottom; wheel scrolling and programmatic `scrollTop` alone do not verify the exception. Preserve the page-level scroll block outside these regions.


**Show the user screenshots of the changed UI before finalizing the task.** Do not rely only on an internal visual inspection or a statement that screenshots were checked; provide the actual screenshots or visible image previews before the final summary.

## Drum pads and margins

**Every horizontal and vertical gap between drum pads must be equal, and all 16 drum pads must be square.** Center a compact grid instead of using `justify-content: space-between`, which creates wider horizontal gaps. Measure all adjacent drum-pad rectangles in both axes before declaring the spacing fixed.

Use **drum pads** for the 16 musical trigger squares and **margins** for empty space around the grid. The user's green-pad screenshot is the size/spacing reference: keep the smaller square drum pads (maximum 21cqw, about 84px at 402px chassis width), and make the bottom outer margin equal to the left and right outer margins within the usable app area. Do not confuse CSS padding with musical pads. Verify bank switching and opening/closing the library cannot change drum-pad geometry. Include the installed iPhone's 812px usable page, 62px top safe inset, and corrected zero bottom inset when checking the 402×874 physical screen; browser-only screenshots miss this layout case.
