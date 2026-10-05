# KoalaTune notes for Claude sessions

- Koala mixer facts (buses, plugin names, parameter ranges, what is still unconfirmed): `docs/koala-mixer-reference.md`. Read it before touching `src/audio/mixerChain.ts` or `src/audio/routing.ts`.
- Bus layout the export writes: A Kick, B Bass, C Drums, D Melodic (with vox and FX), Main for Other. The kick has a bus alone so the bass bus can be sidechained from it.
- The OLED screen text is sized in whole device pixels (`--c`, set by `src/components/useOledCell.ts`). Size anything on the screen in multiples of `--cell`; Silkscreen's pixel is 1/8 of its font size.
- The UI is the Graphite · Barlow design only (spec: `docs/graphite-barlow-redesign-spec.md`). There are no drawers or older themes left.
- Add pack lives in the menu; its folder input must stay mounted outside the menu (closing the menu unmounts it).
- Remote branch deletion returns 403 in the cloud sandbox, so delete merged branches by hand.
- Koala has two EQs: a per-pad EQ in `sampler.json` (`pad.eq`, lo highpass / mid peaking / hi highshelf) and an EQ plugin in `mixer.json`. The measured min and max values in the reference are for the mixer plugin.
- All sound-shaping numbers (loudness trims, per-pad EQ, bus effects, master chain) live in one preset object, `src/audio/mixPresets.ts`. Add a genre by copying it; the guide is `docs/mix-presets.md`. Do not scatter new mix numbers elsewhere.
- Layout height is the viewport as reported (`height: 100%`); do not force the screen height on installed iOS apps (it clipped the transport row on iOS 26). The OLED is a size container: wider than 2:1 in cells means a short screen and the drop zone switches to its compact layout (`@container` in `App.css`).
- The menu ends with the version line (`package.json` version and the git hash, injected by `vite.config.ts` as `__APP_VERSION__` and `__APP_BUILD__`) and the active mix preset. Bump `version` in `package.json` when something users could notice changes, and check the line when testing a build: the PWA caches the old version until it updates.
- `public/viewport-test/` is a diagnostic page (numbered grid, gradient and a readout of every viewport size) served at `/viewport-test/` on the production domain, which needs no Vercel login, as its own installable web app. The `viewport-test` branch holds the same page alone, but branch previews sit behind Vercel's login. Remove the folder (and the `navigateFallbackDenylist` line in `vite.config.ts`) once the render area is settled.
