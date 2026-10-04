# KoalaTune notes for Claude sessions

- Koala mixer facts (buses, plugin names, parameter ranges, what is still unconfirmed): `docs/koala-mixer-reference.md`. Read it before touching `src/audio/mixerChain.ts` or `src/audio/routing.ts`.
- Bus layout the export writes: A Kick, B Bass, C Drums, D Melodic (with vox and FX), Main for Other. The kick has a bus alone so the bass bus can be sidechained from it.
- The OLED screen text is sized in whole device pixels (`--c`, set by `src/components/useOledCell.ts`). Size anything on the screen in multiples of `--cell`; Silkscreen's pixel is 1/8 of its font size.
- The UI is the Graphite · Barlow design only (spec: `docs/graphite-barlow-redesign-spec.md`). There are no drawers or older themes left.
- Add pack lives in the menu; its folder input must stay mounted outside the menu (closing the menu unmounts it).
- Remote branch deletion returns 403 in the cloud sandbox, so delete merged branches by hand.
