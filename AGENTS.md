# TuneGod working instructions

Read CLAUDE.md for the existing implementation and design constraints.

## Required UI verification

User instruction: **ALWAYS COMPARE BEFORE AND AFTER PICTURES WHEN EDITING THE UI.**

Before changing UI, capture screenshots of the affected screens. After changing UI, capture the same screens with the same data, state, viewport and device scale, and inspect both images side by side. Verify at least 402 × 874 and 402 × 762, device scale factor 3. Check that existing controls remain visible, reachable and usable, including the full tuning slider; a build passing does not establish that the UI fits. Fix clipping or overlap before finishing. Retain the screenshots as review artifacts and report the comparison.

## Required scrolling exceptions

The app deliberately blocks page-level touch scrolling in `src/main.tsx` so the chassis stays fixed on screen. **Every scrollable UI region must have an explicit exception in that touchmove handler**, either directly or through an allowed scrollable ancestor. When adding or changing any list, menu, modal or panel, verify its exception, bounded height, overflow and `touch-action`. Test real touch swipes to reach the bottom; wheel scrolling and programmatic `scrollTop` alone do not verify the exception. Preserve the page-level scroll block outside these regions.


**Show the user screenshots of the changed UI before finalizing the task.** Do not rely only on an internal visual inspection or a statement that screenshots were checked; provide the actual screenshots or visible image previews before the final summary.
