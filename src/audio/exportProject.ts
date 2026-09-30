import { encodeWav } from "./wavEncode";
import type { ParsedKoalaProject } from "./koalaProject";
import { PLACEHOLDER_FRAMES, PLACEHOLDER_SAMPLE_RATE } from "./placeholderPads";

/** A silent pad the finger-drumming layout adds: where it sits, what Koala shows on it, and its colour. */
export interface PlaceholderPad {
  index: number;
  label: string;
  color: string;
}

export interface TunedSample {
  sampleId: number;
  sampleRate: number;
  channelData: Float32Array[];
  /** True when the audio length changed (pitch-shifted), so trim points and the pitch knob must be reset. */
  retimed: boolean;
}

/**
 * Rebuilds the project zip with the tuned samples swapped in — same zip paths
 * and sample IDs, so sampler.json's pad->sample mapping stays valid. Each
 * retimed pad's trim points are reset to the new file length and its pitch
 * knob zeroed (the tuning is baked into the audio now). Samples that were only
 * gain-adjusted keep their trim points. `vols` maps sampleId to the pad's
 * volume knob (`vol`, linear: 1 = 0 dB), written to every pad using that sample, replaced or not. `arrangement` maps each pad's original slot to its new slot, or null when the user deleted it; it renumbers the pads, remaps recorded sequence notes and drops deleted sounds' audio. `buses` maps sampleId to a bus index (see BUS_MAIN and friends in routing.ts). `colors` maps sampleId to the hex colour and label that replace the pad's own. `pans` maps sampleId to a Koala pan value
 * (0..1, 0.5 = centre) written to every pad using that sample.
 */
export async function buildTunedKoala(
  project: ParsedKoalaProject,
  tuned: TunedSample[],
  {
    vols,
    buses,
    busNames,
    arrangement,
    pans,
    colors,
    placeholders,
  }: { vols?: Map<number, number>; buses?: Map<number, number>; busNames?: string[]; arrangement?: Map<number, number | null>; pans?: Map<number, number>; colors?: Map<number, { color: string; label: string }>; placeholders?: PlaceholderPad[] } = {},
): Promise<{ blob: Blob; filename: string }> {
  const byId = new Map(tuned.map((t) => [t.sampleId, t]));
  const samplerJson = JSON.parse(JSON.stringify(project.samplerJson));

  for (const pad of samplerJson.pads ?? []) {
    const pan = pans?.get(pad.sampleId);
    if (pan !== undefined) pad.pan = pan;
    const vol = vols?.get(pad.sampleId);
    if (vol !== undefined) pad.vol = vol;
    const bus = buses?.get(pad.sampleId);
    if (bus !== undefined) pad.bus = bus;
    const tint = colors?.get(pad.sampleId);
    if (tint) {
      pad.color = tint.color;
      pad.label = tint.label;
    }
    const t = byId.get(pad.sampleId);
    if (!t) continue;
    if (!t.retimed) continue;
    const frames = t.channelData[0].length;
    pad.start = 0;
    pad.zoomStart = 0;
    pad.end = frames;
    pad.zoomEnd = frames;
    pad.pitch = 0;
  }

  for (const t of tuned) {
    project.zip.file(`sampler/${t.sampleId}.wav`, encodeWav({ sampleRate: t.sampleRate, channelData: t.channelData, bitDepth: 24 }));
  }
  if (arrangement) await applyArrangement(project, samplerJson, arrangement);
  if (placeholders?.length) await addPlaceholderPads(project, samplerJson, placeholders);
  project.zip.file("sampler/sampler.json", JSON.stringify(samplerJson));
  if (busNames) await renameBuses(project, busNames);

  const blob = await project.zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const base = project.originalName.replace(/\.koala$/i, "");
  return { blob, filename: `${base}_tuned.koala` };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A mixer strip as Koala writes it: five empty effect slots, unmuted, at 0 dB. */
const emptyStrip = (name: string) => ({ chain: [null, null, null, null, null], mute: false, name, solo: false, volume: 0 });

/**
 * Sets the bus strip names in mixer.json, keeping each bus's effects and levels. A project that
 * has never opened the mixer has no mixer.json, so one is created from Koala's own layout.
 */
async function renameBuses(project: ParsedKoalaProject, names: string[]): Promise<void> {
  const entry = project.zip.file("mixer.json");
  const mixer = entry ? JSON.parse(await entry.async("string")) : { buses: [], master: emptyStrip("MAIN") };
  mixer.buses = Array.isArray(mixer.buses) ? mixer.buses : [];
  names.forEach((name, i) => {
    mixer.buses[i] = { ...(mixer.buses[i] ?? emptyStrip(name)), name };
  });
  project.zip.file("mixer.json", JSON.stringify(mixer));
}

/**
 * Applies the user's pad moves and deletions. Pad entries are renumbered (a pad's settings live in
 * its entry, so they move with it), notes in recorded sequences follow their pad (notes on a
 * deleted pad are dropped), and audio no remaining pad uses is removed from the archive.
 */
async function applyArrangement(project: ParsedKoalaProject, samplerJson: any, arrangement: Map<number, number | null>): Promise<void> {
  const base = project.padBase;
  const kept: any[] = [];
  const deletedIds = new Set<number>();
  for (const pad of samplerJson.pads ?? []) {
    const orig = Number(pad.pad) - base;
    if (pad.type !== "sample" || !arrangement.has(orig)) {
      kept.push(pad);
      continue;
    }
    const to = arrangement.get(orig);
    if (to === null || to === undefined) {
      deletedIds.add(pad.sampleId);
      continue;
    }
    pad.pad = typeof pad.pad === "number" ? to + base : String(to + base);
    kept.push(pad);
  }
  kept.sort((a, b) => Number(a.pad) - Number(b.pad));
  samplerJson.pads = kept;

  const stillUsed = new Set(kept.filter((p) => p.type === "sample").map((p) => p.sampleId));
  for (const id of deletedIds) {
    if (stillUsed.has(id)) continue;
    project.zip.remove(`sampler/${id}.wav`);
    samplerJson.samples = (samplerJson.samples ?? []).filter((s: any) => s.id !== id);
  }

  const sequenceEntry = project.zip.file("sequence.json");
  if (sequenceEntry) {
    const sequence = JSON.parse(await sequenceEntry.async("string"));
    for (const seq of sequence.sequences ?? []) {
      const pattern = seq?.noteSequence?.pattern;
      if (!Array.isArray(pattern?.notes)) continue;
      pattern.notes = pattern.notes.filter((note: any) => {
        const orig = Number(note.num) - base;
        if (!arrangement.has(orig)) return true;
        const to = arrangement.get(orig);
        if (to === null || to === undefined) return false;
        note.num = to + base;
        return true;
      });
    }
    project.zip.file("sequence.json", JSON.stringify(sequence));
  }

  const songEntry = project.zip.file("song.json");
  if (songEntry) {
    const song = JSON.parse(await songEntry.async("string"));
    const to = typeof song.selectedPad === "number" ? arrangement.get(song.selectedPad - base) : undefined;
    if (to !== undefined) song.selectedPad = to === null ? base : to + base;
    project.zip.file("song.json", JSON.stringify(song));
  }
}

/**
 * Adds the layout's silent pads. They all point at one shared silent sample (a few milliseconds of
 * zeros), and each takes its settings from an existing pad so it carries every field Koala expects.
 * A placeholder whose slot a real pad already holds is skipped.
 */
async function addPlaceholderPads(project: ParsedKoalaProject, samplerJson: any, placeholders: PlaceholderPad[]): Promise<void> {
  const pads: any[] = (samplerJson.pads = Array.isArray(samplerJson.pads) ? samplerJson.pads : []);
  const samples: any[] = (samplerJson.samples = Array.isArray(samplerJson.samples) ? samplerJson.samples : []);
  const base = project.padBase;
  const ids = [...samples.map((s) => s.id), ...pads.map((p) => p.sampleId)].filter((id) => typeof id === "number");
  const sampleId = Math.max(0, ...ids) + 1;
  const padTemplate = pads.find((p) => p.type === "sample");
  const sampleTemplate = samples[0];

  const silence = encodeWav({ sampleRate: PLACEHOLDER_SAMPLE_RATE, channelData: [new Float32Array(PLACEHOLDER_FRAMES)], bitDepth: 16 });
  project.zip.file(`sampler/${sampleId}.wav`, await silence.arrayBuffer());
  samples.push({
    ...(sampleTemplate ? JSON.parse(JSON.stringify(sampleTemplate)) : {}),
    id: sampleId,
    metadata: { ...(sampleTemplate?.metadata ?? {}), originalPath: "silence.wav" },
  });

  const taken = new Set(pads.map((p) => Number(p.pad) - base));
  for (const ph of placeholders) {
    if (taken.has(ph.index)) continue;
    const pad: any = padTemplate ? JSON.parse(JSON.stringify(padTemplate)) : {};
    pad.pad = typeof padTemplate?.pad === "string" ? String(ph.index + base) : ph.index + base;
    pad.type = "sample";
    pad.sampleId = sampleId;
    pad.label = ph.label;
    pad.color = ph.color;
    // Reset the settings that belong to the template's own sample.
    if ("start" in pad) Object.assign(pad, { start: 0, zoomStart: 0, end: PLACEHOLDER_FRAMES, zoomEnd: PLACEHOLDER_FRAMES });
    if ("pitch" in pad) pad.pitch = 0;
    if ("vol" in pad) pad.vol = 1;
    if ("pan" in pad) pad.pan = 0.5;
    pads.push(pad);
  }
  pads.sort((a, b) => Number(a.pad) - Number(b.pad));
}
