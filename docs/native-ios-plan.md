# Native iOS plan (notes)

Status: planning. The web app in this repo stays as is while the UI is designed.

## Goal
Turn Tune God into its own native iOS app (own name, art and branding, able to read `.koala` projects), sold on the App Store.

## Current step: refine the UI with HTML mockups
Keep iterating on the screen in HTML, render it as individual PNGs, and review them on the phone. The mockups are the spec for the later SwiftUI build.

- Target device: iPhone 17 Pro, 402 x 874 pt, rendered at 3x = 1206 x 2622 px, with the Dynamic Island and a ~62 pt corner radius (estimated).
- Skin chosen: "Putty" (beige body, mid-grey pads with a lit pastel side wall, green LCD, Archivo Narrow + VT323).
- Source: `docs/design/putty-mockup.html` (add `#open` to the URL for the key drawer open). Images: `docs/design/putty-home.png`, `docs/design/putty-key-drawer.png`.
- Layout decisions so far:
  - Pad grid moved down; the last row's labels end where the screen corner curve starts.
  - Gap at the screen edges equals the gap between pads. Pad numbers sit left-aligned under each pad.
  - Pad side wall is about 4.5 pt, flat grey tops, no LED dots. Loaded pads glow in washed-out pastel colors.
  - Top row: sideways-keyboard icon with a right arrow, then undo, redo, A-D banks, Tone, Export.
  - Tapping the keyboard icon opens a drawer that slides down with 12 equal-width keys; sharps are tinted darker. The arrow flips to point left when open.
- Fonts in the mockups are Google Fonts for preview only. The Satoshi font change is on branch `claude/satoshi-font` and is set aside for now.

## Later: native build
- SwiftUI on a Mac (a MacBook Air is available). Claude Code can write the Swift; a person has to build and test in Xcode, because the cloud session cannot run iOS.
- Audio: `AVAudioEngine` for low-latency pad triggering.
- Time-stretch and pitch: either Apple's `AVAudioUnitTimePitch` (free) or Rubber Band with a commercial licence.
- Key and BPM detection: write our own (the repo already has a YIN pitch detector) or ask the MTG for an Essentia commercial licence.
- Start fresh in Swift, or port parts of the web app: undecided.

## Licensing (not legal advice, check before shipping)
- This repo is GPL because it uses Rubber Band (GPL) and essentia.js (AGPL). GPL apps conflict with App Store terms.
- Rubber Band commercial licences (Breakfast Quay, one-time, perpetual, no royalties, any platform, prices as of Oct 2026):
  Standard GBP 590 (credit required), small publisher no-credit GBP 1,490, company no-credit GBP 9,320.
- Essentia commercial: no public price, contact mtg-info@upf.edu.
- If either is not replaced or licensed, the native app would have to be released under the same open source license.

## Rough startup cost (estimates from memory unless noted)
- Apple Developer Program: $99 per year (required).
- Mac: already owned.
- Rubber Band licence: GBP 590 (verified), or $0 using Apple's time/pitch.
- Domain plus privacy policy page: about $15-25 per year.
- Optional: LLC ($50-500), trademark (a few hundred and up), lawyer review ($300-1,000+), outside icon designer ($50-300).
- Apple commission: 30%, or 15% under the Small Business Program (under $1M per year).
- Lean first year with the Mac owned: about $100-150. Typical with licence, domain and LLC: roughly $1,000-1,500.

## Next steps
1. Keep refining mockups (home, key drawer, pad press, loaded project, export).
2. Decide Rubber Band vs Apple time/pitch, and own key detection vs Essentia licence.
3. Pick the app name and check it is free to use.
4. Create the Xcode project on the Mac and build the screens from the mockups.
5. Enroll in the Apple Developer Program, test through TestFlight, then submit.
