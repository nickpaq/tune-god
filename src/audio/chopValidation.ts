// The checks on a finished chop export, run on the project it was written into (a copy; nothing is committed until these come back clean).
import { STRETCH_MODE } from "./padSettings";
import { KNOB_MAX, KNOB_MIN } from "./pitchWrap";

export interface ExpectedChop {
  /** 0-based pad number. */
  index: number;
  label: string;
}

/** The problems found; empty when the export is sound. `before` is the sampler's pads before the chops were written. */
export function validateChopExport(args: {
  samplerJson: any;
  sequence: any;
  padBase: number;
  chops: readonly ExpectedChop[];
  pattern: "multiple" | "single";
  /** Pads (0-based) that may change: the chosen destinations. */
  destinations: readonly number[];
  /** Pads of the project before the chop, to prove no other pad was touched. */
  padsBefore: readonly any[];
  /** The pattern slots as they were before the chop: the ones that changed are the chop's. */
  sequencesBefore: readonly any[];
  zipHas: (sampleId: number) => boolean;
}): string[] {
  const { samplerJson, sequence, padBase, chops, pattern, destinations, padsBefore, sequencesBefore, zipHas } = args;
  const problems: string[] = [];
  const pads: any[] = samplerJson.pads ?? [];
  const at = (index: number) => pads.find((p) => Number(p.pad) - padBase === index);
  const dest = new Set(destinations);
  const group = at(chops[0]?.index ?? -1)?.chokeGroup;

  for (const chop of chops) {
    const pad = at(chop.index);
    if (!pad) {
      problems.push(`${chop.label} has no pad`);
      continue;
    }
    if (!dest.has(chop.index)) problems.push(`${chop.label} was written to a pad that was not chosen`);
    if (!zipHas(pad.sampleId)) problems.push(`${chop.label} has no audio file`);
    if (String(pad.stretching) !== "true" || pad.stretch !== STRETCH_MODE.modern) problems.push(`${chop.label} is not stretched in Modern mode`);
    if (typeof pad.pitch !== "number" || pad.pitch < KNOB_MIN || pad.pitch > KNOB_MAX) problems.push(`${chop.label}'s pitch is outside -12 to +12`);
    if (pad.chokeGroup !== group) problems.push(`${chop.label} is not in the same mute group as the other chops`);
    if (pad.chokeGroup === 0 && String(pad.oneshot) !== "false") problems.push(`${chop.label} has no mute group but One Shot is still on`);
    if (pad.chokeGroup > 0 && String(pad.oneshot) !== "true") problems.push(`${chop.label} is in a mute group but One Shot is off`);
  }

  // No pad that was not chosen was changed or lost.
  const written = new Set(chops.map((c) => c.index));
  for (const old of padsBefore) {
    const index = Number(old.pad) - padBase;
    if (dest.has(index) || written.has(index)) continue;
    const now = at(index);
    if (!now || JSON.stringify(now) !== JSON.stringify(old)) problems.push(`pad ${index + 1} was not chosen but changed`);
  }

  // The patterns: every note on the right pad.
  const fresh: any[] = (sequence.sequences ?? []).filter(
    (s: any, i: number) => Array.isArray(s?.noteSequence?.pattern?.notes) && s.noteSequence.pattern.notes.length > 0 && JSON.stringify(s) !== JSON.stringify(sequencesBefore[i]),
  );
  const wanted = new Set(chops.map((c) => c.index + padBase));
  const noted: number[] = fresh.flatMap((s) => s.noteSequence.pattern.notes.map((n: any) => Number(n.num)));
  if (pattern === "single") {
    if (fresh.length !== 1 || noted.length !== chops.length) problems.push(`the one pattern holds ${noted.length} notes instead of ${chops.length}`);
  } else if (fresh.length !== chops.length) problems.push(`${fresh.length} patterns were written instead of ${chops.length}`);
  if (noted.some((n) => !wanted.has(n)) || chops.some((c) => !noted.includes(c.index + padBase))) problems.push("a note refers to the wrong pad");
  return problems;
}
