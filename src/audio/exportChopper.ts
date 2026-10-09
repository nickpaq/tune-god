// Chopper mode in the export: ONE pad that holds the whole sample and Koala's own chopper (synth "CHOPPER", engine "slicer") with the chop points in it,
// read from docs/calibration/chopper-reference.koala. A slice runs from its start frame to the next slice's start (the last to the end of the sample),
// and the velocity of a note picks the slice (`TRIGGER MODE` 1): the velocities are shared out over the slices, so one note from the lowest to the highest
// velocity plays every slice in turn. The note's own pitch transposes the slice (0 here), and the pad pitch knob is in semitones. The pad plays at the sample's own tempo (no stretch), so the project tempo is written to match it.
import { noteTicks } from "./song/noteLengths";
import type { SectionPlan } from "./song/chop";
import { type MakerNote } from "./song/patternMaker";
import {
  emptySequence,
  isEmpty,
  SEQUENCE_SLOTS,
  TICKS_PER_BEAT,
} from "./exportSong";
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
export function sliceLayout(
  plans: readonly SectionPlan[],
  totalFrames: number,
): SliceLayout {
  const starts = new Set<number>([0]);
  for (const p of plans) {
    starts.add(Math.min(totalFrames - 1, Math.max(0, Math.round(p.start))));
    const end = Math.round(p.start + p.length);
    if (end > 0 && end < totalFrames) starts.add(end);
  }
  const sorted = [...starts].sort((a, b) => a - b);
  return {
    starts: sorted,
    sections: plans.map((p) => ({
      slice: sorted.indexOf(
        Math.min(totalFrames - 1, Math.max(0, Math.round(p.start))),
      ),
      bars: p.bars,
    })),
  };
}

/** How many sections can be chopped before the slices (the extras at the start and end included) pass 127: the plans that fit. */
export function fitPlans(
  plans: readonly SectionPlan[],
  totalFrames: number,
): SectionPlan[] {
  let n = plans.length;
  while (
    n > 0 &&
    sliceLayout(plans.slice(0, n), totalFrames).starts.length >
      CHOPPER_MAX_SLICES
  )
    n--;
  return plans.slice(0, n);
}

/**
 * The slice a velocity plays, measured from a render of docs/calibration/probe-chopper.koala: the 128 velocity steps are shared out evenly, so velocity v
 * plays slice floor(v x count / 128) (with 16 slices, 1 to 7 is slice 0, 8 to 15 is slice 1 ...; with 127, velocity v plays slice v - 1).
 */
export const sliceOfVelocity = (velocity: number, count: number): number =>
  Math.floor((velocity * count) / 128);

/** The velocity that plays slice `slice` of `count`: the middle of the whole velocities that play it (never 0). */
export function sliceVelocity(slice: number, count: number): number {
  const lowest = Math.floor((slice * 128 + count - 1) / count);
  const highest = Math.floor(((slice + 1) * 128 + count - 1) / count) - 1;
  return Math.min(127, Math.max(1, Math.floor((lowest + highest) / 2)));
}

export interface ChopperExport {
  /** The pad slot the chopper goes on. */
  index: number;
  label: string;
  color?: string;
  bus?: number;
  /** The sample the chopper slices (the song's own, shared: it is not written twice). */
  sampleId: number;
  /** A packed arrangement gets a new sample; the original source stays available for editing. */
  independentSample?: boolean;
  sampleRate: number;
  /** Only written when the sample is no longer in the project (the song's pad was deleted). */
  channelData: Float32Array[];
  layout: SliceLayout;
  beatsPerBar: number;
  /**
   * The pattern the pattern maker laid out: one pattern of `bars` bars holding a note per chop. When set it replaces the pattern per section. `gate` says a note's
   * length cuts the chop short (a slot cut short, or silence after it), so the chopper's ONE SHOT is switched off and the note length decides.
   */
  pattern?: {
    notes: (MakerNote & { padIndex?: number; sliceCount?: number })[];
    bars: number;
    gate: boolean;
  };
  /** Semitones on the pad's pitch knob. The pad is not stretched, so this also changes its tempo (the caller has put that in the project tempo). */
  pitch: number;
}

const eq = () => ({
  enabled: "false",
  hi: { freq: 8000.0, gain: 0.0, q: 1.0, type: "highshelf" },
  lo: { freq: 100.0, gain: 0.0, q: 1.0, type: "lowshelf" },
  mid: { freq: 1000.0, gain: 0.0, q: 1.0, type: "peaking" },
});

/**
 * Adds the chopper pad and a pattern per section: one note on the chopper pad, at the velocity of that section's slice, held for the section's bars.
 * Returns how many section patterns were written (Koala has 32 pattern slots; the chops beyond them can still be played from the pad).
 */
export async function addChopperPad(
  project: ParsedKoalaProject,
  samplerJson: any,
  chopper: ChopperExport,
  padOnly = false,
): Promise<number> {
  const totalSlices = chopper.layout.starts.length;
  if (totalSlices > CHOPPER_MAX_SLICES) {
    const pageCount = Math.ceil(totalSlices / CHOPPER_MAX_SLICES);
    if (pageCount > 16)
      throw new Error(
        "Bank D is full: maximum 2032 unique chops across 16 pads.",
      );
    let written = 0;
    for (let page = 0; page < pageCount; page++) {
      const first = page * CHOPPER_MAX_SLICES;
      const last = Math.min(totalSlices, first + CHOPPER_MAX_SLICES);
      const from = chopper.layout.starts[first];
      const to = chopper.layout.starts[last] ?? chopper.channelData[0].length;
      const pattern =
        page === 0 && chopper.pattern
          ? {
              ...chopper.pattern,
              notes: chopper.pattern.notes.map((n) => {
                const target = Math.floor(n.slice / CHOPPER_MAX_SLICES);
                return {
                  ...n,
                  slice: n.slice % CHOPPER_MAX_SLICES,
                  padIndex: 48 + target,
                  sliceCount: Math.min(
                    CHOPPER_MAX_SLICES,
                    totalSlices - target * CHOPPER_MAX_SLICES,
                  ),
                };
              }),
            }
          : chopper.pattern
            ? { ...chopper.pattern, notes: [] }
            : undefined;
      written += await addChopperPad(
        project,
        samplerJson,
        {
          ...chopper,
          index: 48 + page,
          label: `${chopper.label} ${page + 1}`,
          independentSample: true,
          channelData: chopper.channelData.map((c) => c.slice(from, to)),
          layout: {
            starts: chopper.layout.starts
              .slice(first, last)
              .map((n) => n - from),
            sections: chopper.layout.sections
              .filter((s) => s.slice >= first && s.slice < last)
              .map((s) => ({ ...s, slice: s.slice - first })),
          },
          pattern,
        },
        !!chopper.pattern && page > 0,
      );
    }
    return written;
  }
  const pads: any[] = (samplerJson.pads = Array.isArray(samplerJson.pads)
    ? samplerJson.pads
    : []);
  const samples: any[] = (samplerJson.samples = Array.isArray(
    samplerJson.samples,
  )
    ? samplerJson.samples
    : []);
  if (chopper.independentSample) {
    const ids = samples.map((s) => Number(s.id)).filter(Number.isFinite);
    let id = Math.max(0, ...ids, chopper.sampleId) + 1;
    while (project.zip.file(`sampler/${id}.wav`)) id++;
    chopper = { ...chopper, sampleId: id };
  }
  const base = project.padBase;
  const stringPads = pads.some((p) => typeof p.pad === "string");
  const slot = chopper.index + base;
  for (let i = pads.length - 1; i >= 0; i--)
    if (Number(pads[i].pad) === slot) pads.splice(i, 1);

  // The song's own file is shared. It is only written again when the export dropped it (its pad was deleted or sat in the hot-swap pool).
  if (!project.zip.file(`sampler/${chopper.sampleId}.wav`)) {
    project.zip.file(
      `sampler/${chopper.sampleId}.wav`,
      await encodeWav({
        sampleRate: chopper.sampleRate,
        channelData: chopper.channelData,
        bitDepth: 24,
      }).arrayBuffer(),
    );
  }
  if (!samples.some((s) => s.id === chopper.sampleId)) {
    samples.push({
      id: chopper.sampleId,
      metadata: {
        bpm: 0.0,
        musicalKey: "",
        originalPath: `${chopper.label}.wav`,
        rootNote: "none",
        source: "Imported",
        tags: [],
      },
    });
  }

  const count = chopper.layout.starts.length;
  pads.push({
    chops: {
      slices: chopper.layout.starts.map((start) => ({
        deleting: 0.0,
        dragStart: -10000.0,
        dragging: false,
        originalStartPosition: start,
        power: 1.0,
        start,
        touchId: -1,
        userEdited: true,
      })),
    },
    pad: stringPads ? String(slot) : slot,
    sampleId: chopper.sampleId,
    synth: "CHOPPER",
    synthParams: {
      MONO: 1.0,
      "ONE SHOT": chopper.pattern?.gate ? 0.0 : 1.0,
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

  if (padOnly) return 0;

  const sequenceEntry = project.zip.file("sequence.json");
  const sequence = sequenceEntry
    ? JSON.parse(await sequenceEntry.async("string"))
    : {
        autoPlay: "next",
        beatsPerBar: 4,
        bpm: 120,
        currSequenceId: 0,
        quantizeDivision: 16,
        quantizing: true,
        seqSnap: "Sequence",
        swing: 0,
      };
  const sequences: any[] = (sequence.sequences = Array.isArray(
    sequence.sequences,
  )
    ? sequence.sequences
    : []);
  while (sequences.length < SEQUENCE_SLOTS) sequences.push(emptySequence());
  if (chopper.beatsPerBar > 0) sequence.beatsPerBar = chopper.beatsPerBar;
  const beatsPerBar =
    Number(sequence.beatsPerBar) > 0 ? Number(sequence.beatsPerBar) : 4;
  const free = sequences
    .map((s, i) => (isEmpty(s) ? i : -1))
    .filter((i) => i >= 0);
  let written = 0;
  if (chopper.pattern) {
    // The pattern maker's sequence: one pattern, each note at its place (`timeOffset`, 1024 ticks to a step, a sixteenth note) held for its steps.
    if (free.length > 0) {
      sequences[free[0]] = {
        ...emptySequence(),
        noteSequence: {
          pattern: {
            numBars: chopper.pattern.bars,
            notes: chopper.pattern.notes.map((n) => ({
              chance: 1.0,
              length: noteTicks(n.start, n.steps, TICKS_PER_BEAT).length,
              num: (n.padIndex ?? chopper.index) + base,
              pan: -1.0078740119934082,
              pitch: 0.0,
              start: 0.0,
              subPad: -1,
              timeOffset: noteTicks(n.start, n.steps, TICKS_PER_BEAT).start,
              vel: sliceVelocity(n.slice, n.sliceCount ?? count),
            })),
          },
        },
      };
      written = 1;
    }
  }
  for (const section of chopper.pattern ? [] : chopper.layout.sections) {
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
