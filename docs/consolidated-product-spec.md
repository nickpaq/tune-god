# TuneGod consolidated product specification — implemented foundation

Version 1.15.0 extends the existing project loader, sample allocation, Web Audio auditioning, waveform/chop tools, native sequencer work, and Koala writer. It does not replace those systems.

## Library workflow

Open **Library · select packs & generate** (or the existing kit folder picker), select the parent library or one pack, and select one, several, or all recognized packs. Each session reconnects files through the browser folder picker. IndexedDB stores paths, folders, file sizes/timestamps, duration in seconds, classification rule version, stable sample identities, pack membership, Type, confidence, filename key/BPM, and manual corrections. It stores no library audio. Browser folder selection still enumerates files to reconnect them; unchanged records reuse their duration and classifications without decoding audio. Rule-version changes reclassify persisted metadata automatically; a legacy index without duration is backfilled on reconnect. **Refresh index** reruns rules and keeps corrections; removed files disappear from the current index.

Pack detection uses typed folder boundaries and retains nested organization paths. Untyped siblings of a recognized pack stay with that pack. With no structural evidence, the nearest named folder is a provisional pack identity. Browser APIs expose relative paths rather than the disk's absolute location; identically named roots should be selected separately and inspected before generation.

The browser shows a color strip from the pack's dominant sound Types, search, a review filter, confidence, Type corrections, and individual sample audition. Imported-sound logs and individually saved audio favorites remain separate, preserving their existing limits.

## Classification and generation

Explicit typed folders supply family context; filenames refine mixed hats, generic/unknown folders, sound Types. Loop status is inherited across the hierarchy. Bass, vocal and FX loops retain their own categories. Unknown files keep low confidence and a review flag; they are not randomly assigned to unrelated slots. The visible category model offers specific sound Types, so bare DRUM and LOOP cannot be selected.

Bank A keeps its 16 slot positions with main Types only: Cymbal / FX / FX / FX; Perc / Perc 2 / Perc / FX; Kick 2 / Snare 2 / Snare 3 / Clap; Kick 1 / Snare 1 / Closed Hat / Open Hat 2. There are no subtype controls or subtype matching. Legacy subtype metadata migrates without reconnecting or rebuilding the library. Old custom templates are no longer used for generation. Repeated generic FX and percussion slots use different sample identities. There is one fixed MPC preset; template editing and additional-bank choices are removed. Existing pad movement, audition, hot swap and sample locks stay available.

Generate kit always fills 48 pads across A–C. A uses the MPC drum layout above. Both B and C mix sound families in organized rows: loops on top, vocals and FX next, melodic sounds below, and bass along the bottom. Bank D is reserved for chops and acapellas and is left untouched. B15, B16 and C15 now request melodic loops in place of bass loops, preserving all 48 positions. Bass loops remain indexed but cannot fill any melodic-loop slot, including fallback allocation.

Generation (Generate kit, Build another kit) replaces only unlocked A–C pads and the kit's hot-swap spares. Locked pads and their sample identities are retained. **Bank D (pads 48–63) is never replaced, cleared or filled by kit generation or any bank loader**: a vocal, acapella or chopped song loaded there independently of the kit stays, and is saved with the project file and the pad state, so it persists across sessions. Only the chop tools write to bank D. Match requested Types first, then randomly fill missing pads with available Types. Preserve each replacement's actual Type. Tiny libraries may share audio across independent pads; do not show shortage notices. **Balance across packs** alternates packs within candidate groups. Repeated preset slots define Type quotas. Existing individual bank loaders remain available.

## Koala export

Defaults follow the supplied mapping. Product buses 1–4 serialize to Koala's `bus` values 0–3: Kick/Bass, Drums, Melodic, Loops/Vox/FX. Both bass Types default to choke group 5. Hats use 1, cymbals 2, drum/percussion loops 3, melodic loops 4, vocal loops 6. One-shots default to One Shot on and Stretch off; loops default to One Shot off and Stretch on (Beats for drum/percussion, Modern otherwise). Koala loop mode stays off.

**Koala Type & pad settings** configures bus, one-shot, choke and stretch. Resolution is Type defaults, then configured Type settings, then explicit saved pad overrides; saved per-pad stretch is an explicit override. Settings are keyed by original pad number so pads sharing audio can differ. Choke 0 allows layering. Bass choke 5 is a configurable default, not a forced override of the user's settings.

The writer retains the original archive's metadata and unknown JSON fields, writes numeric `bus` and `chokeGroup`, preserves boolean/string representation for `oneshot`, `looping` and `stretching`, writes the measured Koala `stretch` mode and `stretchLength` in beats, and records resolved classification. Only explicit pad overrides are stored as overrides, allowing future Type settings to keep working. Generated Bank A labels show the preset's Type assignments. No peak normalization or loudness matching is applied to ordinary pads (chop exports normalize only the section files they render). Mix presets, tuning and fresh-parse-per-export behavior remain in place; the melodic bus EQ follows the new melodic bus index.

Tests verify these fields against the repository's real Koala calibration archives, including mixed boolean representations, metadata retention and shared-sample pads. Opening the resulting exports in Koala on-device remains a separate compatibility check; no device playback verification is claimed.

## Chop tools and future phase

Acapella now offers **Chop by 4 / Chop by 8**. These shortcuts remain absent in Synced mode. Waveform scrubbing/zoom, nudges, the explicit downbeat anchor, zero-crossing/fade handling and all-pad chop destinations remain. Tempo analysis uses a repeated clear low-frequency accent to improve provisional bar-1 alignment and keeps its tracked beat when accents are ambiguous. The explicit user anchor retains precedence. The destination selector has a separate speaker preview control for the focused occupied pad without toggling its selection.

Native playback, recording, sequencing and editing remain a future product phase; this change preserves the existing sequencer work rather than rebuilding or claiming that phase complete.


Library indexing reads file names, paths, sizes, modification times and duration metadata without whole-library PCM decoding. WAV/AIFF/FLAC duration comes from bounded container-header reads; compressed formats use browser metadata loading without playback. Duration collection is limited to four concurrent files; available stored duration is reused even on explicit refresh. Unreadable or unsupported duration stays unknown, never guessed. A live progress bar explains file discovery, saved-index restoration, pack identification, classification and local persistence. Metadata processing yields between batches to keep the interface responsive. First-run duration depends primarily on file count and the browser/device, rather than total audio gigabytes. Browsers may enumerate the selected directory before providing its files to TuneGod; application progress begins once that file list is available. Unchanged entries reuse their classifications on subsequent connections. Audio analysis is limited to generated kit candidates and previews.


Favorites now contain only sounds whose audio is explicitly saved on device. Loading the list deletes legacy non-favorite import records; imports no longer recreate those records. Removing a favorite deletes its cached entry. Tune includes a pixel star below the reference tone volume knob, using the same favorite storage and limits as hot swap. Hot-swap rows have larger touch targets and wider button spacing. Browser validation covers deleting 239 legacy records, saving/restoring/removing a Tune favorite, and the updated row dimensions.


The primary library workflow is now only reconnect files → check pack names → Generate kit. Pack names occupy a bounded scrolling list, and generation stays visible below it. Completed progress bars and per-sample editing no longer occupy the pack selector. Optional Type editing and refresh live under Library tools in the main menu; only main Types are supported. Refresh explicitly asks for the folder again, so new and removed files are rediscovered rather than reclassifying the previous in-memory list. Completion feedback is shown in the selector. Both the Kit start-screen button and the menu kit action open this selector; disconnected libraries prompt reconnection and disable generation until files are available.


Pad dragging offers Shuffle, Delete, Lock and Chopper (there is no Hold). With a connected library, Shuffle loads a random same-Type alternative directly from that library, reusing cached audio when available. Offline, Shuffle uses the existing hot-swap pool, keeps the pad's Type and avoids the current sample and locked sounds. If no eligible alternative exists, the pad stays unchanged with an explanation. The pack list uses colored dots for each contained Type and the current main-menu chassis/keycap styling. UI reviews must show screenshots to the user before the final response, compare before/after using the approved 402 × 873 DPR 3 frame, and verify scrolling exceptions with real touch gestures.


Performance: pad SVGs are memoized, drag position updates directly without rendering the whole app per pixel, unchanged tuning detents do not create edits, and OLED sizing reacts to geometry changes. Saved state is read once on mount. Preset selection shares candidate quotas by Type, decoded WAV bytes count against the project budget, all kit samples have a 30-second limit, and queued analysis jobs allocate mono copies only when a worker slot is available.


Tune omits the floating pitch label and BPM/Stretch row; Shift remains visible above the waveform, which displays a playback line. A manual Type correction persists the library correction, retains the corrected sound in hot swap, and refills its slot directly from the connected library with the original intended Type (or a loaded spare when offline). Locked pads are corrected in place; unavailable replacements leave a labeled gap rather than substituting another Type.


Hot-swap spares default off: new kit imports retain only the 48 requested pad sounds, excluding locked-slot quotas. Connected-library alternatives are indexed as metadata; dragging a pad to Shuffle loads and swaps one same-Type alternative on demand. The optional browser can also preview or select individual sounds; search and 50-row pages bound rendered rows. Favorites decode on demand too. Type corrections keep the corrected sound and load one replacement of the original Type directly from connected files whenever connected. The menu groups secondary controls and highlights Build another kit, which opens pack selection and replaces only the unlocked pads of banks A–C; bank D is left alone. Cents tuning preserves total pitch at semitone boundaries and wraps the hand to the opposite side of the dial.

Ordinary loop exports enable the appropriate stretch mode. The app works out each loop's length (from the tempo in its name, else the project BPM), rounds it to 2, 4, 8 or 16 bars and writes it as `stretchLength` in beats; Koala does not detect the length. Acapella and synced chop exports write their own exact lengths.

Generated Koala pad labels use compact Types without numbers: M Loop, D Loop, P Loop, B Loop, V Loop, FX Loop, HH Closed, HH Open, M Oneshot, and ordinary drum Type names. The bass Type retains 808 where appropriate.

Acapella mode tries project song/vocal detection first. Without a valid pair, prompt for two external audio files (no mixed audio/.koala accept filter). Keep the current project and load sources only into the chop session. Preview and explicit swappable roles precede chopping; clear vocal filenames take priority, otherwise gain-independent onset strength suggests the full song only when distinct. Validate matching duration; do not infer timing alignment from transients.


### Keyed melodic loops (v1.15.3)

A finite duration strictly greater than five seconds plus a bounded filename key automatically resolves to MELODIC LOOP, unless the filename contains `bass` (case-insensitive) or an explicit drum, percussion, vocal or FX Type is identified. Saved manual corrections retain precedence. This rule runs before remaining classification heuristics. Keys support accidentals (including enharmonic E#m and Unicode sharps/flats), attached m/min/minor/maj/major, and separated qualities such as B minor and F# major; unqualified natural-note letters and ordinary words are not keys. Ambient alone is a style hint for this rule, so Ambient_B_minor qualifies; ambient noise and explicit FX folders remain FX.

Melodic-loop Hot Swap shows only canonical melodic loops from the packs selected for the kit, including eligible spares and favorites with a matching source identity/path. Pack selection persists across sessions; unknown source membership is excluded when packs are selected. Connected Shuffle uses the same selected-pack scope. Kit planning consults the persisted Type and duration, never decoding files to evaluate this rule.
