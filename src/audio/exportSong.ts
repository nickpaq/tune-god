// A chopped song in the export: one pad per section (one-shot, all in one choke group so a section cuts the one before it),
// one pattern per section holding that pad's note for the section's whole length, and the project tempo set to the song's.
import { encodeWav } from "./wavEncode";
import type { ParsedKoalaProject } from "./koalaProject";
import { applyPadEq, STRETCH_MODE } from "./padSettings";
import { balanceStats, FILE_CEILING_DB } from "./loudness";
import { ACTIVE_MIX_PRESET } from "./mixPresets";
import { koalaPitch } from "./pitchWrap";

/** Koala's sequencer resolution: ticks in one beat (see docs/koala-mixer-reference.md). */
export const TICKS_PER_BEAT = 4096;
export const SEQUENCE_SLOTS = 32;

/**
 * How Koala stores the length a stretched pad is stretched to, in `pad.stretchLength`: in BEATS, not bars. Read from a project with one pad set to
 * 5 bars of stretch in a 4/4 project: `stretchLength` was 20.0 (docs/calibration/stretch-5-bars.koala). The beats in a bar are the project's
 * (checked for 4/4 only; other time signatures are assumed to count the same way).
 */
export const STRETCH_LENGTH_UNIT: "bars" | "beats" = "beats";

/** The value written to `stretchLength` for a section of `bars` bars. */
export function stretchLengthFor(bars: number, beatsPerBar: number): number {
  return STRETCH_LENGTH_UNIT === "bars" ? bars : bars * beatsPerBar;
}

export interface SongSectionExport {
  /** The grid slot the section's pad goes on. */
  index: number;
  label: string;
  /** Exactly `bars` bars of audio at the song's rate (the last one padded with silence). */
  channelData: Float32Array[];
  /** Bars in the section and in its pattern; the song's `bars` when not given. */
  bars?: number;
  /** The section's exact length in beats (a cut on a beat is not a whole number of bars); `bars` x the beats in a bar when not given. */
  beats?: number;
  /** Where the section starts in the song, in beats on the grid: the one-pattern export puts its note there, relative to the first section. */
  startBeat?: number;
  /** The total pitch change for this pad in semitones (the key move plus the manual tuning); the song's `pitch` when not given. Fitted to Koala's -12..+12 knob. */
  pitch?: number;
  /** The pad's colour (hex), when the app is colouring pads by sound type; the stem pad's own colour is kept when not given. */
  color?: string;
  /** The pad's bus, when the app is routing pads to buses; the stem pad's own bus is kept when not given. */
  bus?: number;
}

export interface SongExport {
  /** The project tempo to write. Left out, the project's own tempo stays (the stretched sections follow whatever it is). */
  bpm?: number;
  /** Semitones written to every section pad's pitch knob (the key offset); the audio is not altered. */
  pitch?: number;
  sampleRate: number;
  /** The pad (by sample id) whose settings every section pad starts from: the song's own pad. */
  sourceSampleId: number;
  sections: SongSectionExport[];
  /** Bars in a section's pattern unless the section says otherwise. */
  bars: number;
  /** The song's time signature numerator; written to the project (the project's own is used when it is not given). */
  beatsPerBar?: number;
  /**
   * How the sections are sequenced. "multiple": a pattern per section. "single": one pattern with every section's note at its musical position.
   * Either also switches the sections to the session rules: one mute group no other pad uses (or, with none free, One Shot off), set for all of them.
   * Left out, the older rules stay (the song pad's own mute group, a pattern per section).
   */
  pattern?: "multiple" | "single";
  /** The stem's pad settings when the stem is not in the project (an acapella zip loaded into bank D); otherwise they are found by `sourceSampleId`. */
  template?: SongTemplate;
}

/** The song's own pad and sample entry, kept before the song pad is removed from the project, for the section pads to start from. */
export interface SongTemplate {
  pad: any;
  sample: any;
}

export function songTemplate(samplerJson: any, sourceSampleId: number): SongTemplate | undefined {
  const pad = (samplerJson.pads ?? []).find((p: any) => p.type === "sample" && p.sampleId === sourceSampleId);
  if (!pad) return undefined;
  const sample = (samplerJson.samples ?? []).find((s: any) => s.id === sourceSampleId);
  return { pad: JSON.parse(JSON.stringify(pad)), sample: sample ? JSON.parse(JSON.stringify(sample)) : undefined };
}

/** A pattern slot as Koala writes it when nothing is recorded. */
export const emptySequence = () => ({ lastViewedPath: "", noteSequence: { pattern: { notes: null, numBars: 1 } }, parameterSequences: null });

export const isEmpty = (seq: any) => !Array.isArray(seq?.noteSequence?.pattern?.notes) || seq.noteSequence.pattern.notes.length === 0;

/** The mute group the sections take when the song pad has none: group 5, as long as no other pad uses it. */
export const SECTION_MUTE_GROUP = 5;

/**
 * The mute group the section pads share (they cut one another). A group the song's pad already has is kept; with none, group 5 if no pad uses it
 * (the hats do, once a kit is loaded), otherwise the first group nobody uses.
 */
export function sectionMuteGroup(source: any, pads: any[]): number {
  const own = Number(source?.chokeGroup);
  if (Number.isFinite(own) && own > 0) return own;
  return pads.some((p) => Number(p.chokeGroup) === SECTION_MUTE_GROUP) ? freeChokeGroup(pads) : SECTION_MUTE_GROUP;
}

/** The first choke group no pad uses yet (0 is no group). */
function freeChokeGroup(pads: any[]): number {
  const used = new Set(pads.map((p) => Number(p.chokeGroup)).filter((n) => Number.isFinite(n)));
  for (let g = 1; g <= 16; g++) if (!used.has(g)) return g;
  return 1;
}

/** Highest mute group number Koala offers. */
export const MUTE_GROUPS = 16;

/** A mute group no pad uses: group 5 if free, otherwise the lowest free one; null when all are taken (then the chops fall back to One Shot off). */
export function unusedMuteGroup(pads: any[]): number | null {
  const used = new Set(pads.map((p) => Number(p.chokeGroup)).filter((n) => Number.isFinite(n) && n > 0));
  if (!used.has(SECTION_MUTE_GROUP)) return SECTION_MUTE_GROUP;
  for (let g = 1; g <= MUTE_GROUPS; g++) if (!used.has(g)) return g;
  return null;
}

export interface TimedChop {
  /** The pad's 0-based number (`num` in the note). */
  pad: number;
  startBeat: number;
  beats: number;
}

export interface PatternNote {
  pad: number;
  /** Ticks from the pattern's start. */
  start: number;
  length: number;
}

/**
 * One pattern holding every chop in song order, each note at the chop's musical start (relative to the first chop). Each note runs to the start of the next
 * chop and the last to the end of the last chop, whatever the pads' One Shot or mute-group settings are: those never change a note.
 */
export function singlePattern(chops: readonly TimedChop[], beatsPerBar: number): { numBars: number; notes: PatternNote[] } {
  const sorted = [...chops].sort((a, b) => a.startBeat - b.startBeat);
  if (sorted.length === 0) return { numBars: 1, notes: [] };
  const origin = sorted[0].startBeat;
  const tick = (beat: number) => Math.round((beat - origin) * TICKS_PER_BEAT);
  const last = sorted[sorted.length - 1];
  const end = tick(last.startBeat + last.beats);
  const notes = sorted.map((c, i) => {
    const start = tick(c.startBeat);
    return { pad: c.pad, start, length: Math.max(1, (i + 1 < sorted.length ? tick(sorted[i + 1].startBeat) : end) - start) };
  });
  return { numBars: Math.max(1, Math.ceil(end / (beatsPerBar * TICKS_PER_BEAT) - 1e-9)), notes };
}

/**
 * Adds the section pads (each with its own 24-bit WAV and sample entry, cloned from the song's pad) and writes the patterns.
 * A section whose slot is taken, or that finds no free pattern, is dropped. Returns how many sections made it in.
 */
export async function addSongSections(project: ParsedKoalaProject, samplerJson: any, song: SongExport, template?: SongTemplate): Promise<number> {
  const pads: any[] = (samplerJson.pads = Array.isArray(samplerJson.pads) ? samplerJson.pads : []);
  const samples: any[] = (samplerJson.samples = Array.isArray(samplerJson.samples) ? samplerJson.samples : []);
  const base = project.padBase;
  const source = template?.pad ?? pads.find((p) => p.type === "sample" && p.sampleId === song.sourceSampleId) ?? pads.find((p) => p.type === "sample");
  const sourceSample = template?.sample ?? samples.find((s) => s.id === source?.sampleId) ?? samples[0];
  const ids = [...samples.map((s) => s.id), ...pads.map((p) => p.sampleId)].filter((id) => typeof id === "number");
  let nextId = Math.max(0, ...ids) + 1;
  const taken = new Set(pads.map((p) => Number(p.pad) - base));
  // The session rules (a pattern mode is given): one mute group nobody else uses for all the chops, and with none free One Shot goes off and the
  // notes alone decide how long each plays. The older rules keep the song pad's own group.
  const session = song.pattern !== undefined;
  const choke = session ? unusedMuteGroup(pads) : sectionMuteGroup(source, pads);
  const single = song.pattern === "single";

  const sequenceEntry = project.zip.file("sequence.json");
  const sequence = sequenceEntry
    ? JSON.parse(await sequenceEntry.async("string"))
    : { autoPlay: "next", beatsPerBar: 4, bpm: song.bpm ?? 120, currSequenceId: 0, quantizeDivision: 16, quantizing: true, seqSnap: "Sequence", swing: 0 };
  const sequences: any[] = (sequence.sequences = Array.isArray(sequence.sequences) ? sequence.sequences : []);
  while (sequences.length < SEQUENCE_SLOTS) sequences.push(emptySequence());
  if (song.beatsPerBar && song.beatsPerBar > 0) sequence.beatsPerBar = song.beatsPerBar;
  const beatsPerBar = Number(sequence.beatsPerBar) > 0 ? Number(sequence.beatsPerBar) : 4;
  const freeSlots = sequences.map((s, i) => (isEmpty(s) ? i : -1)).filter((i) => i >= 0);

  // Every section file is peak-normalized, and the gain taken off again on the pad's volume knob so the sections keep their levels to one another
  // (the loudest sits at the vox target loudness; the knob only turns down).
  const stats = song.sections.map((sec) => balanceStats({ channelData: sec.channelData, sampleRate: song.sampleRate }));
  const gainDb = stats.map((st) => (st.loud === null ? 0 : FILE_CEILING_DB - st.peakDb));
  const loudest = Math.max(-Infinity, ...stats.map((st) => st.loud ?? -Infinity));
  const shift = Number.isFinite(loudest) ? ACTIVE_MIX_PRESET.loudness.targetLufs.vox - loudest : 0;
  const normalized = new Map(
    song.sections.map((sec, i) => {
      const g = 10 ** (gainDb[i] / 20);
      const knobDb = stats[i].loud === null ? 0 : Math.min(0, shift - gainDb[i]);
      return [sec, { data: sec.channelData.map((ch) => ch.map((v) => v * g)), vol: 10 ** (knobDb / 20) }] as const;
    }),
  );

  let added = 0;
  let firstPattern = -1;
  const placed: TimedChop[] = [];
  for (const section of [...song.sections].sort((a, b) => a.index - b.index)) {
    if (taken.has(section.index) || (!single && added >= freeSlots.length)) continue;
    const sampleId = nextId++;
    const frames = section.channelData[0].length;
    project.zip.file(`sampler/${sampleId}.wav`, await encodeWav({ sampleRate: song.sampleRate, channelData: normalized.get(section)!.data, bitDepth: 24 }).arrayBuffer());
    samples.push({
      ...(sourceSample ? JSON.parse(JSON.stringify(sourceSample)) : {}),
      id: sampleId,
      // The stem's own metadata stays as it is (Koala does not need a sample tempo to stretch: the reference project's is 0.0 with stretch on).
      metadata: { ...(sourceSample?.metadata ?? {}), originalPath: `${section.label}.wav` },
    });
    const pad = source ? JSON.parse(JSON.stringify(source)) : { type: "sample" };
    pad.pad = typeof source?.pad === "string" ? String(section.index + base) : section.index + base;
    pad.sampleId = sampleId;
    pad.label = section.label;
    if (section.color) pad.color = section.color;
    if (section.bus !== undefined) pad.bus = section.bus;
    pad.chokeGroup = choke ?? 0;
    // Koala writes some booleans as strings; keep whichever style the pad already uses.
    const oneShot = choke !== null;
    pad.oneshot = typeof source?.oneshot === "boolean" ? oneShot : String(oneShot);
    pad.looping = typeof source?.looping === "boolean" ? false : "false";
    // Stretch on, for as many bars as the section's pattern: if the project tempo changes (or the pad is moved), the vocals stretch to stay in time,
    // and at the song's own tempo (which the export sets) they are not altered at all.
    pad.stretching = typeof source?.stretching === "string" ? "true" : true;
    pad.stretch = STRETCH_MODE.modern;
    pad.stretchLength = section.beats ?? stretchLengthFor(section.bars ?? song.bars, beatsPerBar);
    // The pitch change stays on Koala's knob (the file is never repitched); beyond +-12 it is the same note in a reachable octave (see pitchWrap.ts).
    Object.assign(pad, { start: 0, zoomStart: 0, end: frames, zoomEnd: frames, pitch: koalaPitch(section.pitch ?? song.pitch ?? 0).knob, vol: normalized.get(section)!.vol, pan: 0.5 });
    applyPadEq(pad, ACTIVE_MIX_PRESET.sectionEq);
    if ("loopPoint" in pad) pad.loopPoint = -1;
    pads.push(pad);
    taken.add(section.index);

    placed.push({ pad: section.index + base, startBeat: section.startBeat ?? placed.reduce((sum, c) => sum + c.beats, 0), beats: section.beats ?? (section.bars ?? song.bars) * beatsPerBar });
    if (single) {
      added++;
      continue;
    }
    const bars = section.bars ?? song.bars;
    const slot = freeSlots[added];
    if (firstPattern < 0) firstPattern = slot;
    sequences[slot] = {
      ...emptySequence(),
      noteSequence: {
        pattern: {
          numBars: section.beats ? Math.max(1, Math.ceil(section.beats / beatsPerBar - 1e-9)) : bars,
          notes: [
            {
              chance: 1.0,
              length: Math.round((section.beats ?? bars * beatsPerBar) * TICKS_PER_BEAT),
              num: section.index + base,
              pan: -1.0078740119934082,
              pitch: 0.0,
              start: 0.0,
              subPad: -1,
              timeOffset: 0,
              vel: 127.0,
            },
          ],
        },
      },
    };
    added++;
  }
  if (single && added > 0 && freeSlots.length > 0) {
    // One pattern for the whole chop: every chop's note where it sits in the song, held to the next one.
    const { numBars, notes } = singlePattern(placed, beatsPerBar);
    firstPattern = freeSlots[0];
    sequences[firstPattern] = {
      ...emptySequence(),
      noteSequence: {
        pattern: {
          numBars,
          notes: notes.map((n) => ({ chance: 1.0, length: n.length, num: n.pad, pan: -1.0078740119934082, pitch: 0.0, start: 0.0, subPad: -1, timeOffset: n.start, vel: 127.0 })),
        },
      },
    };
  } else if (single) added = 0;
  pads.sort((a, b) => Number(a.pad) - Number(b.pad));
  if (added > 0) {
    if (song.bpm !== undefined) sequence.bpm = song.bpm;
    sequence.autoPlay = "next"; // each pattern plays on into the next, so the song plays through
    sequence.currSequenceId = firstPattern;
    project.zip.file("sequence.json", JSON.stringify(sequence));
  }
  return added;
}
