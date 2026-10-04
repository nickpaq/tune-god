# Graphite · Barlow redesign: implementation spec

Source of truth: the "KoalaTune Redesign" canvas (https://claude.ai/artifact/Rw8XaNNm7X9Urx3jFWHpVA), page "Graphite · Barlow" (`fonts`). The three boards `FBarlowType`, `FBarlowTune` and `FBarlowSwap` are thin wrappers around one shared component, `project/Main.dc.html`, configured with `chassis="graphite" mode="hardware" font="barlow"` and `screen="type" | "tune" | "swap"`. Every value below is taken from that component. Board size: 390 x 844 px. Barlow is used everywhere; Silkscreen is used only on the pixel screen.

Goal: re-skin and re-lay-out the app to match, **without changing behaviour** (loading, analysis, tuning, drag and drop, all-pads view, undo, export, menu options, modals).

## 0. Status of the work on branch `graphite-barlow-redesign`

Uncommitted, in progress. Done:

| Item | State |
| --- | --- |
| `@fontsource/barlow-semi-condensed` and `@fontsource/silkscreen` installed and imported in `src/main.tsx` | done |
| `src/index.css` rewritten with graphite tokens | done |
| `index.html` theme-color and `vite.config.ts` manifest colours set to `#222326` | done |
| `src/components/TypeKeys.tsx` (new) | done |
| `src/components/Keyboard.tsx` (piano layout markup) | done |
| `src/components/SwapList.tsx` (SVG glyphs, no header, footer count) | done |
| `src/components/PadPanel.tsx` (Tune screen markup) | done |
| `src/App.tsx` (mode state, new JSX, Add pack in menu) | done, compiles |
| `ClassifierDrawer.tsx` and `useDrawerDrag.ts` | deleted |
| **`src/App.css`** | **NOT written. It still holds the old putty/drawer styles, so the app is visually broken until section 6 is done.** |
| README / docs updates | not done |
| Visual verification | not done |

The remaining work is mainly section 6 (the stylesheet) plus verification (section 9).

## 1. Fonts

- UI: **Barlow Semi Condensed**, weights 500, 600, 700. Keycaps use 600; pad captions and the name plate use 700.
- Pixel screen: **Silkscreen**, 400 (700 is installed but only needed if bold is wanted).
- Self-hosted through `@fontsource/*` imports in `src/main.tsx` (CSS plus bundled woff2), so the offline PWA keeps working. Do not use the Google Fonts `<link>` the canvas uses.
- Root stack: `"Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif`. Remove "DIN Alternate", "Archivo Narrow" and "Barlow Condensed".
- Pixel screen: `font-family: "Silkscreen", monospace; -webkit-font-smoothing: none;` text uppercase.

## 2. Colour tokens (`src/index.css`)

The old token names are kept and remapped so the menu and modals re-theme automatically.

| Token | Value | Use |
| --- | --- | --- |
| `--stage` | `#1a1b1d` | page background |
| `--chassis1` | `#2a2b2e` | upper panel (design `body`), menus, modals |
| `--chassis2` | `#222326` | lower panel (design `deck`), theme-color |
| `--hi` | `#3a3c40` | highlight seam |
| `--edge` | `#121314` | dark seam, outlines |
| `--ink` | `#dcd8cc` | text on chassis (design `keyText`) |
| `--ink3` | `#9a968b` | silkscreen text (design `silk`) |
| `--well` | `#18191b` | tray background (design `tray`) |
| `--btn` | `#3c3e43` | button fill |
| `--accent` | `#ff5b24` | LEDs, primary button |
| `--key` / `--key-hi` / `--key-edge` / `--key-ink` | `#3c3e43` / `#4a4c52` / `#141517` / `#dcd8cc` | keycaps |
| `--led-off` | `#3a3b40` | unlit LED |
| `--seam-d` / `--seam-l` | `#121314` / `#3a3c40` | panel seams |
| `--oled` | `#eef2ec` | pixel colour (the canvas `oled` prop default) |
| `--oled-glow` | `rgba(238,242,236,.33)` | text glow (`oled + '55'`) |
| `--bezel` | `#0b0b0c` | screen bezel |

Black keys (piano sharps): gradient `#26272b` to `#141517`, text `#bdb9ae`, edge `#000`. The pad well is `#0d0d0e`. `color-scheme: dark`.

## 3. Units

The chassis is already sized in `cqw` (1% of the chassis width, `container-type: size` on `.phone`). Convert canvas px to cqw as `px / 3.9` (390 px = 100cqw). Examples: 44 px = 11.3cqw, 36 px = 9.2cqw, 120 px = 30.8cqw, 80 px = 20.5cqw, 16 px = 4.1cqw, 6 px = 1.5cqw. Keep `.phone` width `min(100vw, calc(var(--app-h, 100dvh) * 9 / 17.6))` and `height: 100%`. At 390 x 844 the layout must land on the canvas dimensions.

## 4. Layout (top to bottom)

`.phone` is a flex column with no padding of its own. It has two children plus overlays:

1. **`.upper`** (flex 1, min-height 0, flex column, gap 2.6cqw): background `--chassis1`, bottom border `1px solid --seam-d`. Padding: top `max(3cqw, env(safe-area-inset-top))`, sides 4.1cqw, bottom 3cqw. Contains, in order, `.controls`, `.screen-wrap` (flex 1) and the optional `.deck`.
2. **`.lower`** (flex none): background `--chassis2`, `box-shadow: inset 0 1px 0 --seam-l`. Padding: sides 4.1cqw, top 2cqw, bottom `calc(max(var(--u), env(safe-area-inset-bottom)) + 3cqw)`. Contains `.padzone` then `.transport` (gap 2cqw).
3. Overlays that stay direct children of `.phone`: `.menu`, `.palette-backdrop` modals, and the `.drag-ghost` outside `.phone`.

Vertical budget at 390 x 844 (canvas): header 44 px, screen bezel 184 px (OLED 168) in Tune/Type or 313 px (OLED 297) in Swap, deck 120 px, pad well about 349 px, transport 40 px. The screen is `flex: 1`, so it absorbs the deck's height in Swap mode (deck not rendered) and any spare height on taller phones.

Pad height variable (on `.pads`; cq units must resolve against the chassis):

```
--pad-h: min(20.5cqw, calc((100cqh - 3cqw - 11.3cqw - 5 * 2.6cqw - 45cqw - 30.8cqw - 3cqw - 4.5cqw - 10.3cqw - 8cqw) / 4));
```

That is the canvas size, shrinking only when the chassis is short (it reserves a 45cqw minimum screen and the deck).

## 5. Behaviour and state mapping

Replace the two sliding drawers and the tuning-fork and grid buttons with one mode.

```ts
type Mode = "tune" | "type" | "swap";
const [mode, setMode] = useState<Mode>("swap");
const shownMode = mode === "swap" && !layout.on ? "tune" : mode;
```

- Removed state: `drawer`, `drawerAfter`, `tuning`, the drawer drag hook, `toggleDrawer`, `toggleTuning`, `tuneShown`.
- **Swap needs the finger-drumming layout** (the list only exists with it). With the layout off the Swap key is `disabled` (with a title explaining why) and the screen shows Tune. The old behaviour (tuning panel whenever no layout) is preserved. When the layout is later switched on, `mode` is still `"swap"`.
- Mode keys: TUNE, TYPE, SWAP (`aria-pressed` on the active one, `aria-label` "Tune mode", "Sound type mode", "Hot swap mode").
- Bank keys keep `data-drop="bank"` and `data-index`, `bank--target` becomes `cap--target`, and empty banks dim.
- **Deck by mode:** Type shows the 15 `TypeKeys`; Tune shows the `Keyboard` plus the ALL/ONE and TONE keys; Swap shows no deck.
- ALL/ONE toggles `tuneAll`; TONE toggles `toneOn`. Both keep `aria-pressed`.
- Pressing the key already selected on the piano still switches tuning off (existing `selectKey` behaviour); holding a key still sounds the sine (existing `Keyboard` pointer code).
- **Add pack** moves from the deleted type drawer into the menu (after "Layouts"), with a hidden `webkitdirectory` input (`addPackInput` ref). Disabled when `!hasProject || !layout.on || analyzing > 0 || addPackStatus`; shows `addPackStatus` while busy.
- The category `<select>` in the pad panel is removed; the Type mode replaces it. `PadPanel` therefore loses its `autoColor` prop and gains `keyName`.
- Drag and drop (pad drag, HOLD zone, all-pads view, trash and "Unused pad"), undo/redo, export and the modals are untouched. `.hold-zone` and `.drop-targets` stay absolutely positioned inside `.screen-wrap`; `.allpads` stays inside `.padzone`.

## 6. Component and CSS spec

Class names below are the ones already used in the JSX.

### 6.1 Header (`.controls`)
Height 11.3cqw, `display: flex`, gap 2.6cqw (canvas gap 10 px). Three parts:

- **`.tray`** (twice: modes, banks): flex row, gap 1cqw, padding 1cqw, radius 2.6cqw, background `--well`, `box-shadow: inset 0 2px 4px rgba(0,0,0,.35), 0 1px 0 --seam-l`.
- **Mode caps** `.cap--mode`: 9.7cqw x 9.2cqw. Font 600, 2.6cqw, letter-spacing .12em.
- **Bank caps** `.cap--bank`: 8.7cqw x 9.2cqw. Font 600, 4.1cqw.
- **Menu** `.cap--menu`: `flex: 1`, margin 1cqw 0, column, centred, gap 1.3cqw. Hamburger SVG (`.cap--menu__glyph`, 3.6cqw wide, `fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round`) above the "MENU" legend (2.6cqw, letter-spacing .12em).

### 6.2 Keycap (`.cap`, shared by every key)
- `border: 0; padding: 0; border-radius: 1.5cqw` (mode, bank, side, menu) or 1.8cqw (side and transport).
- Colour `--key-ink`; background `linear-gradient(180deg, var(--key-hi), var(--key))`.
- Rest: `box-shadow: 0 3px 0 var(--key-edge), 0 5px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.2)`.
- On (`.cap--on`, also `:active`): `transform: translateY(2px); box-shadow: inset 0 2px 4px rgba(0,0,0,.35), 0 1px 0 var(--key-edge)`.
- `.cap__led`: absolute, centred horizontally, top 1.3cqw, 1.3cqw circle, background `--led-off`, `box-shadow: inset 0 1px 1px rgba(0,0,0,.4)`. In `.cap--on` it is `--accent` with `box-shadow: 0 0 5px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent)`.
- `.cap__legend`: absolute, left/right 0, bottom 1.8cqw (bank 1.5cqw), centred, uppercase.
- `.cap--empty .cap__legend`: opacity .45. `.cap--target`: `outline: .8cqw solid var(--accent); outline-offset: .2cqw`. `:disabled`: opacity .4, no pointer.
- `.cap--side` (Tune deck, ALL/ONE and TONE): `flex: 1`; LED top 2.3cqw; legend bottom 2.6cqw; font 2.6cqw, letter-spacing .1em.
- `.cap--transport` (undo/redo): 16.4cqw x 9.2cqw, grid centred; SVG 4.1cqw, `fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap/linejoin: round`. `:disabled` opacity .35.

### 6.3 Screen (`.screen-wrap` > `.screen` > `.oled`)
- `.screen-wrap`: `position: relative; flex: 1; min-height: 38cqw; display: flex`.
- `.screen` (the bezel): `flex: 1; padding: 2cqw 2.8cqw; border-radius: 2.6cqw; background: --bezel; box-shadow: inset 0 2px 6px rgba(0,0,0,.75), 0 1px 0 --seam-l`.
- `.oled`: `position: relative; height: 100%; display: flex; flex-direction: column; background: #000; border-radius: .5cqw; overflow: hidden; font: 400 6.15cqw/1 Silkscreen, monospace; color: --oled; text-shadow: 0 0 6px --oled-glow; text-transform: uppercase`. (6.15cqw = 24 px: one logical pixel is 3 CSS px and a text row is 8 logical px.)
- `.oled::before` pixel grid: `inset: 0; pointer-events: none; z-index: 2; background-image: linear-gradient(to right, rgba(0,0,0,.62) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.62) 1px, transparent 1px); background-size: 3px 3px` (a fixed 3 px grid, to avoid moire).
- `.oled::after` glass: `inset: 0; pointer-events: none; z-index: 2; background: linear-gradient(165deg, rgba(255,255,255,.07), rgba(255,255,255,0) 38%)`.
- `.oled__head` (title bar, inverse video): flex, space-between, height 6.15cqw, padding 0 .8cqw, background `--oled`, color `#000`, `text-shadow: none`. Left is the mode title ("HOT SWAP", "SOUND TYPE", "TUNE"); right is the pad id (`A15`: bank letter plus slot 1 to 16) or "ALL PADS" in Tune when Tune all is on.
- Inside `.oled`, set `--accent: var(--oled); --accent-ink: #000; --track: rgba(238,242,236,.28)` so the slider and other shared parts draw in OLED ink.
- `.screen__message` and `.dropzone`: flex column, centred, gap 1.5cqw, `height: 100%`, text-align centre. `strong` 9cqw/.95, spans 5cqw. Keep the marching-ants outline (white dash over black base) and `.dropzone__pack` (border `.77cqw solid currentColor`, font 3.4cqw).

### 6.4 Type screen (`.type-readout`)
Flex column, padding .8cqw, gap 1.2cqw. In order:
1. `.type-readout__name`: the category label at 2x size (12.3cqw), uppercase ("Closed Hat", "Drum Loop"; shows "ANALYZING…" until classified).
2. `.type-readout__sample`: sample display name (`displayName(pad.name, tags)`), 6.15cqw, single line with ellipsis.
3. `.type-readout__line`: flex space-between: `KEY C#` (or `--` when untuned) and the signed total shift `+0.00ST`.
4. The `Waveform` canvas, flex 1, min-height 8cqw (this replaces the canvas's decorative "LVL" meter with real data).

### 6.5 Tune screen (`.pad-panel`)
Flex column, padding .8cqw, gap 1cqw.
- `.pad-panel__top`: flex, gap 3cqw, align start.
  - `.pad-panel__note`: the tuned note at 3x size (18.5cqw), line-height .85, or `--`.
  - `.pad-panel__lines`: flex column, gap 1cqw: the `.tune-toggle` button ("TUNE ON" / "TUNE OFF"), then "SHIFT +0.00ST", then "TRIM +0.00ST".
- `.tune-toggle`: height 6.15cqw, padding 0 1.2cqw, border `.77cqw solid var(--oled)`, transparent, Silkscreen; on = inverse (background `--oled`, color `#000`, border none).
- `.waveform`: `flex: 1 1 0; height: 0; min-height: 8cqw; width: 100%; color: --oled; border-top/bottom: 1px solid var(--track)` (height 0 plus flex basis 0 is required so the canvas never sizes the screen from its pixel buffer).
- `.pad-panel__slider--off`: opacity .35, no pointer events.
- `.precision-slider`: restyle in pixel style. Track 0.77cqw high in `--track`; fill and thumb in `--oled`; centre notch (1-logical-pixel tall tick, taller at centre) kept; thumb a 1.5cqw x 3.5cqw frame with a black centre; value bubble (`.precision-slider__bubble`) in inverse video (background `--oled`, color `#000`, Silkscreen). Keep the existing behaviour (finer toward the bottom of the screen, double-tap resets) exactly.
- `.pad-panel__scale`: flex space-between, 4.6cqw, `-12st` and `+12st`.

### 6.6 Swap screen (`.swap-list`)
- `.swap-list`: flex column, height 100%.
- `.swap-list__rows`: flex 1, min-height 0, `overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none` (keep the `::-webkit-scrollbar` hide). The `touchmove` guard in `src/main.tsx` allows `.swap-list__rows` and `.palette-modal__list`.
- `.swap-row`: flex, align centre, gap .8cqw, height 6.9cqw (canvas row 27 px), padding-left .8cqw; the optional scroll-snap start per row.
- `.swap-row__name`: flex 1, ellipsis, single line.
- `.swap-row__btn` (play and swap): 8.5cqw x 6.15cqw, border `.77cqw solid var(--oled)`, transparent, centred SVG (3.5cqw, `fill: currentColor`). Inverse (background `--oled`, color `#000`) while pressed or `--on` (playing). SVG glyphs: play triangle, stop square, swap arrows (already in `SwapList.tsx`).
- `.swap-list__empty`: centred "No other sounds to swap in".
- `.swap-list__foot`: `N sounds`, 6.15cqw, right-aligned or split with the type, optional; omit if cramped.
- Swap mode renders no deck, so `.screen-wrap` grows to about 80cqw tall at the canvas size.

### 6.7 Deck (`.deck`, fixed height 30.8cqw)
- **Type:** `.type-keys` grid, 5 columns (`minmax(0,1fr)`), `grid-auto-rows: 9.2cqw`, gap 1.5cqw. Order is the `PLATES` order, which matches the canvas (kick, snare, clap, closed, open, cymbal, vox, perc, drum loop, perc loop, melodic, melodic loop, bass, fx, other).
  - `.type-key`: cap styling with radius 1.8cqw; `.type-key__lamp`: absolute, left 1.8cqw, top 1.8cqw, 3.6cqw x 1cqw, radius .5cqw, background `var(--c)`, opacity .35; `.type-key__legend`: absolute, left 1.8cqw, bottom 1.8cqw, nowrap, 2.6cqw, 600, letter-spacing .08em, uppercase.
  - `.type-key--on`: pressed cap, lamp opacity 1 with `box-shadow: 0 0 5px var(--c), 0 0 12px color-mix(in srgb, var(--c) 60%, transparent)`.
  - `:disabled` (no real pad selected): lamps stay dim, opacity .5.
  - `--c` comes from `colorFor(palette, id)` (the existing palette picker still drives it).
- **Tune (`.deck--tune`):** flex row, gap 2cqw.
  - `.keyboard`: `position: relative; flex: 0 0 75.4cqw; height: 100%`. `.keyboard__naturals`: flex row, gap .5cqw, height 100%. `.key--natural`: `flex: 1`, radius `0 0 1.5cqw 1.5cqw`, cap styling, 2.8cqw legend at bottom 2cqw, LED at bottom 6.2cqw (1.5cqw dot).
  - `.key--sharp`: `position: absolute; top: 0; width: 6.7cqw; height: 18cqw; radius: 0 0 1.3cqw 1.3cqw`; black-key colours from section 2; LED at bottom 5cqw, legend bottom 1.8cqw (2.3cqw). Left edge: `calc((var(--i) + 1) * (100% - 6 * .5cqw) / 7 + var(--i) * .5cqw + .25cqw - 3.35cqw)` (so the black key sits centred on the gap after natural `--i`).
  - `.key--selected`: pressed (`translateY(2px)` plus inset shadow) with the LED lit. Keep `touch-action: none` on keys.
  - `.deck__side`: `flex: 1; display: flex; flex-direction: column; gap: 1.5cqw` holding the two `.cap--side` keys.

### 6.8 Pads (`.padzone` and `.pads`)
- `.padzone`: `position: relative; isolation: isolate; margin-inline: -1.5cqw; padding: 1.5cqw; border-radius: 2.6cqw; background: #0d0d0e; box-shadow: inset 0 2px 6px rgba(0,0,0,.8)`.
- `.pads`: `display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); grid-auto-rows: var(--pad-h); gap: 1.5cqw`.
- `.pad` (wide, not square; the old `aspect-ratio: 1` and 3D extrusion are removed): radius 1cqw, `touch-action: none`, no border.
  - Empty: `background: radial-gradient(75% 70% at 50% 45%, #2c2d30, #1c1d1f 75%); box-shadow: inset 0 1px 0 rgba(255,255,255,.06), inset 0 -3px 8px rgba(0,0,0,.4)`.
  - `.pad--loaded` (lit): `background: radial-gradient(75% 70% at 50% 55%, color-mix(in srgb, var(--c) 55%, #fff), color-mix(in srgb, var(--c) 88%, #fff) 65%, color-mix(in srgb, var(--c) 82%, #000) 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), inset 0 -3px 8px rgba(0,0,0,.22), 0 0 12px color-mix(in srgb, var(--c) 33%, transparent)`.
  - `.pad--selected`: centre mix 38% colour / 62% white and `box-shadow: ..., 0 0 22px color-mix(in srgb, var(--c) 67%, transparent), 0 0 0 2px #fff`. The marching-ants SVG on the selected pad is removed.
  - `.pad--dragging` opacity .35; `.pad--target` outline `.9cqw solid var(--accent)`.
  - `.pad--tuned::after`: a check mark at the bottom left (bottom 1.4cqw, left 1.8cqw, 5cqw, `#fff`).
  - `.pad--placeholder`: lit but dimmed (opacity about .6) so silent pads read as empty.
- `.pad__number` (caption inside the pad): absolute, left 1.8cqw, top 1.5cqw, right 1.5cqw, font 700, 2.6cqw/3.1cqw, letter-spacing .06em, uppercase, nowrap, ellipsis, color `rgba(20,20,22,.78)` (unlit pads: `#8a8780`), `pointer-events: none`. Drop the old multiply blend. Keep the `relabel` keyframe animation.
- `.pad__symbol` (the "Show symbols on pads" option) moves to the bottom right: `bottom: 8%; right: 7%`; remove `top`/`left`; stroke `rgba(20,20,22,.55)`.
- `.allpads` overlay: unchanged, but use dark tokens (the empty cell `#7b7b7e` becomes `#2c2d30`).

### 6.9 Transport and name plate (`.transport`)
Flex row, align centre, gap 2cqw, height 10.3cqw. Two `.cap--transport` keys, then `.nameplate` (`margin-left: auto; text-align: right; color: --ink3`): `.nameplate__name` "KOALATUNE" 700, 3.3cqw, letter-spacing .32em; `.nameplate__sub` "16 PADS · 4 BANKS" 500, 2.3cqw, letter-spacing .24em, margin-top 1cqw.

### 6.10 Menu and modals
Keep their existing rules (copied unchanged from the old file: menu, palette, layout, sound-row, long-samples, extra-drums), since they read the remapped tokens. Then fix the few hard-coded light colours: `linear-gradient(#3a3832, #2e2c28)` and `#a49e8c` in the old rules and `#7b7b7e` in `.allpads__cell`. Move `.menu` to `top: calc(max(3cqw, env(safe-area-inset-top)) + 11.3cqw + 1.2cqw); right: 4.1cqw`. If the menu now overflows the screen, give it `max-height` and `overflow-y: auto`.

## 7. Files

| File | Change |
| --- | --- |
| `package.json`, `package-lock.json` | add the two `@fontsource` packages |
| `src/main.tsx` | import font CSS; update the `touchmove` selector comment and list |
| `src/index.css` | graphite tokens, Barlow stack |
| `src/App.css` | rewrite per section 6 (keep: marching-ants, hold-zone and drop-targets, drag-ghost, menu/modals, allpads, dropzone__pack) |
| `src/App.tsx` | mode state, `.upper`/`.lower` wrappers, header, OLED, deck, transport, menu Add pack, no drawers |
| `src/components/TypeKeys.tsx` | new |
| `src/components/Keyboard.tsx` | piano markup with `--i` for sharps |
| `src/components/PadPanel.tsx` | OLED Tune markup, `keyName` prop, no category select |
| `src/components/SwapList.tsx` | glyphs, no header, count footer |
| `src/components/ClassifierDrawer.tsx`, `useDrawerDrag.ts` | deleted |
| `src/components/typePlates.ts` | kept (order drives the type keys and the palette picker) |
| `index.html`, `vite.config.ts` | `#222326` theme and background colours |
| `README.md` | update "Interface", "Sound categories", "Tuning" and the Add-pack text (drawer wording becomes mode keys) |

Nothing in `src/audio/` or the workers changes.

## 8. Differences from the canvas (intentional)

The canvas draws its screen from 112 x 56 logical pixels and its buttons do nothing. The app uses real DOM text in Silkscreen on the same 3 px grid, so these differ:

- The Type screen shows a real waveform where the canvas has a fake LVL meter.
- The Tune screen uses the real precision slider and waveform, with a Tune on/off chip, in place of the canvas's static slider and "TARGET / TRIM / TONE" lines. Tone state is shown on the deck's TONE key.
- The Swap list has play and swap buttons per row and no highlighted cursor row (the app has no encoder cursor).
- The canvas's wear marks, scratches and "screen" (soft key) mode are not implemented; only `mode="hardware"` is.
- The canvas's three chassis themes (graphite, bone, console) are not implemented; only graphite.

## 9. Verification (do all of these before calling it done)

1. `npx tsc -b`, `npx oxlint` (the existing warnings in `fingerDrumming.test.ts` and `App.tsx:461` are not new), `npm test`, `npm run build`.
2. `npm run dev`, then with Playwright (Chromium is at `/opt/pw-browsers/chromium`) screenshot at 390 x 844 in each of: Type, Tune, Swap, and the empty drop zone. Compare with the three canvas boards: header, screen size (about 184 px bezel / 313 px in Swap), deck 120 px, pad rows 80 px.
3. Load `docs/fixtures/pad-numbering.koala` (or a sample pack folder) and check by hand: select a pad in each mode; change its type from the deck; pick a key; toggle ALL/ONE and TONE; drag a pad (HOLD zone appears over the screen, bank dwell opens all-pads, trash and Unused pad work); swap a sound from the list; undo and redo; open the menu and run Add pack; layout off shows Tune with Swap disabled.
4. Check a shorter viewport (for example 390 x 700) and a wide one (for example 1024 x 768): nothing overflows, and pads shrink before the screen collapses.
5. Check offline: after a build, the fonts load from the bundle with no network requests to `fonts.googleapis.com`.
6. Do not open a PR unless asked.
