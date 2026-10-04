# Mix presets: every value you can tweak

All the numbers that decide how an export sounds are in one object, `HEAVY_WARM_HIP_HOP` in `src/audio/mixPresets.ts`. Each field there has a comment saying what it does and its valid range. This page lists them with advice on which way to move them. Koala's plugin names, ranges and quirks are in [koala-mixer-reference.md](./koala-mixer-reference.md), and `mixerChain.test.ts` and `mixPresets.test.ts` fail if a value goes out of range.

## Adding a genre

1. Copy `HEAVY_WARM_HIP_HOP` in `src/audio/mixPresets.ts`, give it a new `id` and `name`, and change the values below.
2. Add it to `MIX_PRESETS`.
3. Point `ACTIVE_MIX_PRESET` at it. The export (`mixerChain.ts`, `padSettings.ts`) and the loudness balance (`loudness.ts`) all read the active preset, so nothing else changes.
4. Run `npm test`. A menu to choose the preset is not built yet; `MIX_PRESETS` is the list it would use.

## 1. Loudness (`loudness`)

Applied at export, and when Normalize now is on. Every sound is gain-matched to one loudness first, then these shape the mix.

| Field | What it does | Range | Move it to |
| --- | --- | --- | --- |
| `categoryTrimDb` | Pad knob trim per sound type, the mix itself | 0 or below | Lower = that type sits further back. Hats and cymbals down for warm, up for bright and crisp |
| `bonusDb` | dB a type sits above the common loudness | any, small | Raise kick and bass for heavy |
| `crestBonusDb` | Extra peak room per type | any, small | Raise to let a type peak higher, lower to hold it down (hats and cymbals are held down so they never rival the snare) |
| `maxCrestDb` | Most any peak may stand above the common loudness | about 6 to 12 | Lower tames transients, higher keeps them punchy |
| `peakLimitedFraction` | Share of pads allowed to fall short of the common loudness | 0 to 1 | Rarely changed |

Current heavy and warm trims: kick 0, bass 0, snare -2, clap -3, closed and open hat -9, cymbal -10, perc -5, melodic -4, vox -3, FX -7, drum loop -3, perc and melodic loops -5, other -3. Kick and bass sit 4 dB above the common loudness.

Not in the preset: `FILE_CEILING_DB` in `loudness.ts` (the -1 dBFS peak ceiling of every file, not a genre choice).

## 2. Per-pad EQ (`padEq`)

Written under Settings by sound type. Koala's per-pad EQ is the same design as its EQ plugin: low band highpass, mid bell, high band high shelf, each 20 Hz to 20 kHz and +-18 dB.

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
| `bassSidechain.threshold` | Bass bus SIDECHAIN | Kick level that makes the bass duck | -60 to 0 dB | Lower ducks on quieter kicks |
| `bassSidechain.release` | same | Time for the bass to return | 10 to 1000 ms | Short is tight, long pumps |
| `bassSidechain.output` | same | Level after ducking, not the depth | -12 to +12 dB | Rarely changed |
| `melodicEq` | Melodic bus EQ | lo highpass, mid bell, hi shelf (freq, gain, Q for each) | freq 20 to 20000 Hz, gain +-18 dB, Q 0.5 to 10 | Raise `lo freq` to clear more low end, lower `hi gain` to darken |

The sidechain source (the kick bus) is fixed by the bus layout in `routing.ts` (`CATEGORY_BUS`, `BUS_NAMES`), which also decides which sound types go on which bus.

## 4. Master chain (`master`)

Written, in order, into an empty master strip when "Heavy, warm master chain" is on. Five slots at most. Each entry is a plugin name and its parameters, so a genre can reorder, drop or add plugins.

| Plugin | Parameter | Range | What it does in this preset |
| --- | --- | --- | --- |
| EQ | `lo freq` | 20 to 20000 Hz | Highpass at 20 Hz, a rumble filter only. Raise to thin the sub |
| EQ | `mid freq`, `mid gain`, `mid Q` | 20 to 20000 Hz, +-18 dB, 0.5 to 10 | Bell at 70 Hz, +2.5 dB: the weight. Move the frequency to place the low-end push |
| EQ | `hi freq`, `hi gain`, `hi Q` | same | Shelf from 8 kHz at -3 dB: the warmth. More negative is darker |
| DRIVE | `drive`, `mix`, `out`, `oversample` | 0 to 36 dB, 0 to 1, -90 to 0 dB, 0/1 | 6 dB at a 30% mix, HQ on: parallel saturation. Raise `mix` for more |
| COMPRESSOR | `threshold`, `ratio`, `attack`, `release`, `makeup` | about -42 to -1.7 dB, 1 to 100, 0.01 to 30 ms, 10 to 1200 ms, 0/1 | -12 dB, 2:1, 20 ms attack, 200 ms release, auto make-up off: slow glue |
| CLIPPER | `input`, `threshold`, `output`, `oversample` | see section 3 | -1.5 dB threshold, no drive: shaves peaks before the limiter |
| LIMITER | `gain`, `attack`, `release` | +-18 dB (input gain), 1.5 to 6 ms, 60 to 1000 ms | +3 dB into the limiter: the master loudness knob |

Other plugins Koala has that a preset could use (parameters in the reference): STEREOIZER, UTILITY, WARBLE, PLATE REVERB, METER, FREEVERB, BITCOOKER.

## Other settings that are not in a preset yet

These live elsewhere and are not genre-specific so far. Move them into a preset if a genre needs its own.

- Playback settings by type (mute groups, one-shot, release): `basePlayback` in `src/audio/padSettings.ts`.
- Stereo spread of melodic pads (up to 40% either side): the spread option in `src/App.tsx`.
- Which bus each sound type goes to, and bus names: `src/audio/routing.ts`.
- Colour palettes and labels: `src/audio/palettes.ts`, `src/audio/padLabels.ts`.
- Which sounds a sample pack loads for each slot, and how many spares: `src/audio/samplePack.ts`.
