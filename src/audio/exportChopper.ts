// Chopper mode in the export: ONE pad that holds the whole sample and Koala's own chopper (synth "CHOPPER", engine "slicer") with the chop points in it,
// read from docs/calibration/chopper-reference.koala. A slice runs from its start frame to the next slice's start (the last to the end of the sample),
// and the velocity of a note picks the slice: the 127 velocities are shared out over the slices, so one note from the lowest to the highest velocity
// plays every slice in turn. The pad plays at the sample's own tempo (no stretch), so the project tempo is written to match it.
import type { SectionPlan } from "./song/chop";
import { emptySequence, isEmpty, SEQUENCE_SLOTS, TICKS_PER_BEAT } from "./exportSong";
import { encodeWav } from "./wavEncode";
import type { ParsedKoalaProject } from "./koalaProject";

/** Koala's chopper holds up to 127 slices (the velocities 1 to 127). */
export const CHOPPER_MAX_SLICES = 127;

/** Where the slices start and which slice each section is. */
export interface SliceLayout {
  /** Start frame of every slice, ascending, the first always 0. */
  starts: number[];
  /** For each section, the slice that plays it. */
  sections: { slice: number; bars: number }[];
}

/**
 * The slices for a chop. Audio before the first cut is slice 0 (the chopper's first slice always starts at the beginning of the sample), and a slice
 * starts where the last section ends so the tail of the song does not play on into the final section.
 */
export function sliceLayout(plans: readonly SectionPlan[], totalFrames: number): SliceLayout {
  const starts = new Set<number>([0]);
  for (const p of plans) {
    starts.add(Math.min(totalFrames - 1, Math.max(0, Math.round(p.start))));
    const end = Math.round(p.start + p.length);
    if (end > 0 && end < totalFrames) starts.add(end);
  }
  const sorted = [...starts].sort((a, b) => a - b);
  return {
    starts: sorted,
    sections: plans.map((p) => ({ slice: sorted.indexOf(Math.min(totalFrames - 1, Math.max(0, Math.round(p.start)))), bars: p.bars })),
  };
}

/** How many sections can be chopped before the slices (the extras at the start and end included) pass 127: the plans that fit. */
export function fitPlans(plans: readonly SectionPlan[], totalFrames: number): SectionPlan[] {
  let n = plans.length;
  while (n > 0 && sliceLayout(plans.slice(0, n), totalFrames).starts.length > CHOPPER_MAX_SLICES) n--;
  return plans.slice(0, n);
}

/**
 * The velocity that plays slice `slice` of `count`: the middle of that slice's share of 1 to 127 (with 127 slices, exactly slice + 1). Which velocity
 * range Koala gives each slice when there are fewer than 127 is not measured, so the middle keeps it safe against either rounding.
 */
export function sliceVelocity(slice: number, count: number): number {
  if (count >= CHOPPER_MAX_SLICES) return Math.min(127, slice + 1);
  return Math.min(127, Math.max(1, Math.round(((slice + 0.5) * 127) / count + 0.5)));
}

export interface ChopperExport {
  /** The pad slot the chopper goes on. */
  index: number;
  label: string;
  color?: string;
  bus?: number;
  /** The sample the chopper slices (the song's own, shared: it is not written twice). */
  sampleId: number;
  sampleRate: number;
  /** Only written when the sample is no longer in the project (the song's pad was deleted). */
  channelData: Float32Array[];
  layout: SliceLayout;
  beatsPerBar: number;
  /** Semitones on the pad's pitch knob. The pad is not stretched, so this also changes its tempo (the caller has put that in the project tempo). */
  pitch: number;
}

const eq = () => ({ enabled: "false", hi: { freq: 8000.0, gain: 0.0, q: 1.0, type: "highshelf" }, lo: { freq: 100.0, gain: 0.0, q: 1.0, type: "lowshelf" }, mid: { freq: 1000.0, gain: 0.0, q: 1.0, type: "peaking" } });

/**
 * Adds the chopper pad and a pattern per section: one note on the chopper pad, at the velocity of that section's slice, held for the section's bars.
 * Returns how many section patterns were written (Koala has 32 pattern slots; the chops beyond them can still be played from the pad).
 */
export async function addChopperPad(project: ParsedKoalaProject, samplerJson: any, chopper: ChopperExport): Promise<number> {
  const pads: any[] = (samplerJson.pads = Array.isArray(samplerJson.pads) ? samplerJson.pads : []);
  const samples: any[] = (samplerJson.samples = Array.isArray(samplerJson.samples) ? samplerJson.samples : []);
  const base = project.padBase;
  const stringPads = pads.some((p) => typeof p.pad === "string");
  const slot = chopper.index + base;
  for (let i = pads.length - 1; i >= 0; i--) if (Number(pads[i].pad) === slot) pads.splice(i, 1);

  // The song's own file is shared. It is only written again when the export dropped it (its pad was deleted or sat in the hot-swap pool).
  if (!project.zip.file(`sampler/${chopper.sampleId}.wav`)) {
    project.zip.file(`sampler/${chopper.sampleId}.wav`, await encodeWav({ sampleRate: chopper.sampleRate, channelData: chopper.channelData, bitDepth: 24 }).arrayBuffer());
  }
  if (!samples.some((s) => s.id === chopper.sampleId)) {
    samples.push({ id: chopper.sampleId, metadata: { bpm: 0.0, musicalKey: "", originalPath: `${chopper.label}.wav`, rootNote: "none", source: "Imported", tags: [] } });
  }

  const count = chopper.layout.starts.length;
  pads.push({
    chops: {
      slices: chopper.layout.starts.map((start) => ({ deleting: 0.0, dragStart: -10000.0, dragging: false, originalStartPosition: start, power: 1.0, start, touchId: -1, userEdited: true })),
    },
    pad: stringPads ? String(slot) : slot,
    sampleId: chopper.sampleId,
    synth: "CHOPPER",
    synthParams: {
      MONO: 1.0,
      "ONE SHOT": 1.0,
      "PLAY THRU": 0.0,
      SENSITIVITY: 0.5,
      "SLICE MODE": 0.0,
      "TRIGGER MODE": 1.0, // 0 = the key played picks the slice, 1 = the velocity does (read from a project Koala saved with the mode switched)
      padParams: {
        bus: chopper.bus ?? -1,
        channel: 0,
        ...(chopper.color ? { color: chopper.color } : {}),
        eq: eq(),
        label: chopper.label,
        muted: false,
        pan: 0.5,
        pitch: chopper.pitch,
        vol: 1.0,
      },
      synth: "slicer",
      version: 1000,
    },
    type: "synth",
  });
  pads.sort((a, b) => Number(a.pad) - Number(b.pad));

  const sequenceEntry = project.zip.file("sequence.json");
  const sequence = sequenceEntry
    ? JSON.parse(await sequenceEntry.async("string"))
    : { autoPlay: "next", beatsPerBar: 4, bpm: 120, currSequenceId: 0, quantizeDivision: 16, quantizing: true, seqSnap: "Sequence", swing: 0 };
  const sequences: any[] = (sequence.sequences = Array.isArray(sequence.sequences) ? sequence.sequences : []);
  while (sequences.length < SEQUENCE_SLOTS) sequences.push(emptySequence());
  if (chopper.beatsPerBar > 0) sequence.beatsPerBar = chopper.beatsPerBar;
  const beatsPerBar = Number(sequence.beatsPerBar) > 0 ? Number(sequence.beatsPerBar) : 4;
  const free = sequences.map((s, i) => (isEmpty(s) ? i : -1)).filter((i) => i >= 0);
  let written = 0;
  for (const section of chopper.layout.sections) {
    if (written >= free.length) break;
    sequences[free[written]] = {
      ...emptySequence(),
      noteSequence: {
        pattern: {
          numBars: section.bars,
          notes: [
            {
              chance: 1.0,
              length: section.bars * beatsPerBar * TICKS_PER_BEAT,
              num: chopper.index + base,
              pan: -1.0078740119934082,
              pitch: 0.0,
              start: 0.0,
              subPad: -1,
              timeOffset: 0,
              vel: sliceVelocity(section.slice, count),
            },
          ],
        },
      },
    };
    written++;
  }
  if (written > 0) {
    sequence.autoPlay = "next";
    sequence.currSequenceId = free[0];
    project.zip.file("sequence.json", JSON.stringify(sequence));
  }
  return written;
}
