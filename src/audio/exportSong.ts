// A chopped song in the export: one pad per section (one-shot, all in one choke group so a section cuts the one before it),
// one pattern per section holding that pad's note for the section's whole length, and the project tempo set to the song's.
import { encodeWav } from "./wavEncode";
import type { ParsedKoalaProject } from "./koalaProject";

/** Koala's sequencer resolution: ticks in one beat (see docs/koala-mixer-reference.md). */
export const TICKS_PER_BEAT = 4096;
const SEQUENCE_SLOTS = 32;

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
  /** The pad's colour (hex), when the app is colouring pads by sound type; the stem pad's own colour is kept when not given. */
  color?: string;
  /** The pad's bus, when the app is routing pads to buses; the stem pad's own bus is kept when not given. */
  bus?: number;
}

export interface SongExport {
  /** The project tempo: the song's. */
  bpm: number;
  sampleRate: number;
  /** The pad (by sample id) whose settings every section pad starts from: the song's own pad. */
  sourceSampleId: number;
  sections: SongSectionExport[];
  /** Bars in a section's pattern unless the section says otherwise. */
  bars: number;
  /** The song's time signature numerator; written to the project (the project's own is used when it is not given). */
  beatsPerBar?: number;
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
const emptySequence = () => ({ lastViewedPath: "", noteSequence: { pattern: { notes: null, numBars: 1 } }, parameterSequences: null });

const isEmpty = (seq: any) => !Array.isArray(seq?.noteSequence?.pattern?.notes) || seq.noteSequence.pattern.notes.length === 0;

/** The first choke group no pad uses yet (0 is no group). */
function freeChokeGroup(pads: any[]): number {
  const used = new Set(pads.map((p) => Number(p.chokeGroup)).filter((n) => Number.isFinite(n)));
  for (let g = 1; g <= 16; g++) if (!used.has(g)) return g;
  return 1;
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
  const choke = freeChokeGroup(pads);

  const sequenceEntry = project.zip.file("sequence.json");
  const sequence = sequenceEntry
    ? JSON.parse(await sequenceEntry.async("string"))
    : { autoPlay: "next", beatsPerBar: 4, bpm: song.bpm, currSequenceId: 0, quantizeDivision: 16, quantizing: true, seqSnap: "Sequence", swing: 0 };
  const sequences: any[] = (sequence.sequences = Array.isArray(sequence.sequences) ? sequence.sequences : []);
  while (sequences.length < SEQUENCE_SLOTS) sequences.push(emptySequence());
  if (song.beatsPerBar && song.beatsPerBar > 0) sequence.beatsPerBar = song.beatsPerBar;
  const beatsPerBar = Number(sequence.beatsPerBar) > 0 ? Number(sequence.beatsPerBar) : 4;
  const freeSlots = sequences.map((s, i) => (isEmpty(s) ? i : -1)).filter((i) => i >= 0);

  let added = 0;
  let firstPattern = -1;
  for (const section of [...song.sections].sort((a, b) => a.index - b.index)) {
    if (taken.has(section.index) || added >= freeSlots.length) continue;
    const sampleId = nextId++;
    const frames = section.channelData[0].length;
    project.zip.file(`sampler/${sampleId}.wav`, await encodeWav({ sampleRate: song.sampleRate, channelData: section.channelData, bitDepth: 24 }).arrayBuffer());
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
    pad.chokeGroup = choke;
    // Koala writes some booleans as strings; keep whichever style the pad already uses.
    pad.oneshot = typeof source?.oneshot === "boolean" ? true : "true";
    pad.looping = typeof source?.looping === "boolean" ? false : "false";
    // Stretch on, for as many bars as the section's pattern: if the project tempo changes (or the pad is moved), the vocals stretch to stay in time,
    // and at the song's own tempo (which the export sets) they are not altered at all.
    pad.stretching = typeof source?.stretching === "string" ? "true" : true;
    pad.stretchLength = stretchLengthFor(section.bars ?? song.bars, beatsPerBar);
    Object.assign(pad, { start: 0, zoomStart: 0, end: frames, zoomEnd: frames, pitch: 0, vol: 1, pan: 0.5 });
    if ("loopPoint" in pad) pad.loopPoint = -1;
    pads.push(pad);
    taken.add(section.index);

    const bars = section.bars ?? song.bars;
    const slot = freeSlots[added];
    if (firstPattern < 0) firstPattern = slot;
    sequences[slot] = {
      ...emptySequence(),
      noteSequence: {
        pattern: {
          numBars: bars,
          notes: [
            {
              chance: 1.0,
              length: bars * beatsPerBar * TICKS_PER_BEAT,
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
  pads.sort((a, b) => Number(a.pad) - Number(b.pad));
  if (added > 0) {
    sequence.bpm = song.bpm;
    sequence.autoPlay = "next"; // each pattern plays on into the next, so the song plays through
    sequence.currSequenceId = firstPattern;
    project.zip.file("sequence.json", JSON.stringify(sequence));
  }
  return added;
}
