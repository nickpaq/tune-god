# Marketing cards

`cards.tpl.html` is the source of the feature cards (one rounded card per section, transparent background). The `@@name@@` markers (start, lib, kitA, kitB, kitC, swap, drag, tune, export, ktps, scheme) are screenshots of the app, inlined as base64 WebP. The text follows `README.md`, `CLAUDE.md` and `docs/consolidated-product-spec.md`: check it against them when features change (an earlier set described the Mix and Master chain switches and the Organize sorting flow, which no longer exist as they were).

To rebuild:
1. `python3 genpack.py <dir>` writes a synthetic sample pack (about 140 files in kit folders). Copy it three times under different pack names to make a library, and put the copies in one folder.
2. `npx vite build`, serve `dist` with `navigator.standalone` set (the app shows an install page in a normal browser) and use a 402 x 874 viewport at 3x. Connect the library from the Kit button, Select all, Generate kit, then take screenshots: the start screen, the library list, banks A to C, the hot-swap list for a snare pad, a pad dragged up (Shuffle, Delete, Lock, Chopper), Tune with a key picked, the export box, Koala export settings and the colour scheme list.
3. Crop each, replace its marker, swap the Google Fonts link for local `@font-face` rules (Barlow Semi Condensed 500, 600 and 700 and Silkscreen woff2 files from `@fontsource`), add `body{background:transparent}` and render each `.card > .sec` plus `.foot` with `omitBackground`.
