# TuneGod working instructions

Read CLAUDE.md for the existing implementation and design constraints.

## Required UI verification

User instruction: **ALWAYS COMPARE BEFORE AND AFTER PICTURES WHEN EDITING THE UI.**

Before changing UI, capture screenshots of the affected screens. After changing UI, capture the same screens with the same data, state, viewport and device scale, and inspect both images side by side. Verify at least 402 × 874 and 402 × 762, device scale factor 3. Check that existing controls remain visible, reachable and usable, including the full tuning slider; a build passing does not establish that the UI fits. Fix clipping or overlap before finishing. Retain the screenshots as review artifacts and report the comparison.
