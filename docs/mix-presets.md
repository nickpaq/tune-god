# Mix presets: every value you can tweak

All the numbers that decide how an export sounds are in one object, `HEAVY_WARM_HIP_HOP` in `src/audio/mixPresets.ts`. Each field there has a comment saying what it does and its valid range. This page lists them with advice on which way to move them. Koala's plugin names, ranges and quirks are in [koala-mixer-reference.md](./koala-mixer-reference.md), and `mixerChain.test.ts` and `mixPresets.test.ts` fail if a value goes out of range.

## Adding a genre

1. Copy `HEAVY_WARM_HIP_HOP` in `src/audio/mixPresets.ts`, give it a new `id` and `name`, and change the values below.
2. Add it to `MIX_PRESETS`.
3. Point `ACTIVE_MIX_PRESET` at it. The export (`mixerChain.ts`, `padSettings.ts`) and the loudness balance (`loudness.ts`) all read the active preset, so nothing else changes.
4. Run `npm test`. A menu to choose the preset is not built yet; `MIX_PRESETS` is the list it would use.

## 1. Loudness (`loudness`)

Applied at export, and when Normalize now is on. Every file is peak-normalized to the -1 dBFS ceiling, and nothing is ever turned down in the audio: the mix is each pad's Koala volume knob.

| Field | What it does | Range | Move it to |
| --- | --- | --- | --- |
| `targetLufs` | Where each sound type sits after the knob, as the loudest-200 ms loudness (K-weighted LUFS) of the normalized file at its knob level | negative LUFS | Lower = that type sits further back. Hats and cymbals down for warm, up for bright and crisp. The knob can only turn down, so a file already under its target stays at 0 dB |
| `padTone` | Koala's tone knob (a tilt EQ, 0 = the middle) by type | about -1 to 1 | The snare is at -0.1: a touch darker |

Current targets: kick -13, bass and 808 -15, snare -19, clap -21, closed hat -29, open hat and cymbal -27, perc -23, melodic -21, vox -19, FX -27, drum loop -22, perc loop -27, melodic loop -22, other -22. The kick leads, the hats and cymbals are held well back. These are estimates taken from the earlier calibration renders (docs/koala-mixer-reference.md, round 3c); correct them from a render. `scripts/simulateBalance.ts` shows each pad's output level for any targets before you export: `npx tsx scripts/simulateBalance.ts closedHat=-30 kick=-12`.

Not in the preset: `FILE_CEILING_DB` in `loudness.ts` (the -1 dBFS peak ceiling of every file, not a genre choice).

## 2. Per-pad EQ (`padEq`)

Written under Settings by sound type. Koala's per-pad EQ has a low band that is a highpass (measured: on at gain -18, off at gain 0), a mid bell and a high shelf; the EQ plugin's low band is a low shelf instead, each 20 Hz to 20 kHz and +-18 dB.

| Field | What it does | Range | Move it to |
| --- | --- | --- | --- |
| `highpassHz` | Highpass on that sound type | 20 to 20000 Hz | Higher thins the pad and clears the low end for kick and bass. Kick and bass are not listed so they are left alone |
| `highShelfDb` | Gain of the 8 kHz high shelf | -18 to +18 dB | Negative is warmer and darker, positive brighter. Leave out to keep the pad's own |

Current: hats 300 Hz, cymbal 250, perc, clap and FX 200, perc loop 150, snare and vox 120, melodic and melodic loop 80. Hats and cymbals -2 dB shelf.

## 3. Buses (`buses`)

Written when "Route pads to buses" is on. Bus A is Kick, B Bass, C Drums, D Melodic.

| Field | Where | What it does | Range | Move it to |
| --- | --- | --- | --- | --- |
| `kickClipper.input` | Kick bus CLIPPER | Drive into the clip | -36 to +36 dB | Up for more clipping |
| `kickClipper.threshold` | same | Clip level and softness of the curve | about -35 to 0 dB | Near 0 is a hard clip, low is a soft S-curve. Lower also lowers the kick's peak |
| `kickClipper.output` | same | Level after the clip | -36 to 0 dB | Can only turn down |
| `kickClipper.oversample` | same | HQ button | 0 or 1 | 1 for less aliasing |
| `fade808.withinDb` / `minMs` / `maxMs` | The soft fade-in every 808 gets instead of a sidechain | The fade is as long as the kick's main transient (how long its envelope stays within `withinDb` of its peak, `kickTransient.ts`), held between `minMs` and `maxMs` | 6 dB, 4 to 30 ms | Longer fade = more room for the kick, less 808 attack |
| `melodicEq` | Melodic bus EQ | lo low shelf, mid bell, hi shelf (freq, gain, Q for each) | freq 20 to 20000 Hz, gain +-18 dB, Q 0.5 to 10 | Lower `lo gain` to clear more low end, lower `hi gain` to darken |

The bus layout is fixed in `routing.ts` (`CATEGORY_BUS`, `BUS_NAMES`), which decides which sound types go on which bus. There is no sidechain.

## 4. Master chain (`master`)

Two chains, `master.dynamic` and `master.loud` (type `MasterStyle`), chosen by the menu's Master chain switch and its style list; the chosen one is written, in order, into an empty master strip. Five slots at most. Each entry is a plugin name and its parameters, so a genre can reorder, drop or add plugins.

| Plugin | Parameter | Range | What it does in this preset |
| --- | --- | --- | --- |
| EQ | `lo freq` | 20 to 20000 Hz | Highpass at 20 Hz, a rumble filter only. Raise to thin the sub |
| EQ | `mid freq`, `mid gain`, `mid Q` | 20 to 20000 Hz, +-18 dB, 0.5 to 10 | Bell at 70 Hz, +2.5 dB: the weight. Move the frequency to place the low-end push |
| EQ | `hi freq`, `hi gain`, `hi Q` | same | Shelf from 8 kHz at -3 dB: the warmth. More negative is darker |
| DRIVE | `drive`, `mix`, `out`, `oversample` | 0 to 36 dB, 0 to 1, -90 to 0 dB, 0/1 | 6 dB at a 30% mix, HQ on: parallel saturation. Raise `mix` for more |
| COMPRESSOR | `threshold`, `ratio`, `attack`, `release`, `makeup` | about -42 to -1.7 dB, 1 to 100, 0.01 to 30 ms, 10 to 1200 ms, 0/1 | -12 dB, 2:1, 20 ms attack, 200 ms release, auto make-up off: slow glue |
| CLIPPER | `input`, `threshold`, `output`, `oversample` | see section 3 | -1.5 dB threshold, no drive: shaves peaks before the limiter |
| LIMITER | `gain`, `attack`, `release` | +-18 dB (input gain), 1.5 to 6 ms, 60 to 1000 ms | The master loudness knob. Dynamic: +6 dB, ratio about 12 dB (reference 12.2), about -13 LUFS. Loud: +7 dB behind a harder clipper (input +3, threshold -3), drive 8 / mix 0.35 and a firmer, faster compressor (-16 dB, 3:1, 10 ms, 120 ms), release 61 ms, for about -9 LUFS and a ratio of about 9 dB. Both are estimates until a render measures them |

Other plugins Koala has that a preset could use (parameters in the reference): STEREOIZER, UTILITY, WARBLE, PLATE REVERB, METER, FREEVERB, BITCOOKER.

## Other settings that are not in a preset yet

These live elsewhere and are not genre-specific so far. Move them into a preset if a genre needs its own.

- Playback settings by type (mute groups, one-shot, release): `basePlayback` in `src/audio/padSettings.ts`.
- Stereo spread of melodic pads (up to 40% either side): the spread option in `src/App.tsx`.
- Which bus each sound type goes to, and bus names: `src/audio/routing.ts`.
- Colour palettes and labels: `src/audio/palettes.ts`, `src/audio/padLabels.ts`.
- Which sounds a sample pack loads for each slot, and how many spares: `src/audio/samplePack.ts`.
