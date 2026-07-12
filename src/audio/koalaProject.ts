// A .koala project (Koala Sampler, iOS) is a zip archive under the hood —
// sampler/sampler.json holds the pad grid + per-sample metadata, and each
// pad's audio lives at sampler/{sampleId}.wav. We read/write that structure
// directly from the zip bytes; the .koala extension is cosmetic (JSZip
// doesn't care what the file is called), so no literal rename is needed.
import JSZip from "jszip";
import { encodeWav } from "./wavEncode";
import { downloadBlob } from "./exportSample";
import type { SampleItem } from "../state/samplesStore";

export interface KoalaPadRef {
  pad: number;
  sampleId: number;
  /** Friendly name for the UI, derived from the sample's original import path when available. */
  fileName: string;
}

export interface ParsedKoalaProject {
  zip: JSZip;
  samplerJson: any;
  /** Project-level settings (keyboard mode/scale, grid); absent in older/foreign exports. */
  songJson: any | null;
  /** Transport settings (bpm, swing, ...); absent in older/foreign exports. */
  sequenceJson: any | null;
  originalName: string;
  pads: KoalaPadRef[];
}

export function isKoalaFile(file: File): boolean {
  return /\.koala$/i.test(file.name);
}

function basename(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

export async function parseKoalaProject(file: File): Promise<ParsedKoalaProject> {
  const zip = await JSZip.loadAsync(file);
  const samplerEntry = zip.file("sampler/sampler.json");
  if (!samplerEntry) throw new Error("That doesn't look like a Koala project file (no sampler/sampler.json inside).");
  const samplerJson = JSON.parse(await samplerEntry.async("string"));

  const songEntry = zip.file("song.json");
  const songJson = songEntry ? JSON.parse(await songEntry.async("string")) : null;
  const sequenceEntry = zip.file("sequence.json");
  const sequenceJson = sequenceEntry ? JSON.parse(await sequenceEntry.async("string")) : null;

  const nameById = new Map<number, string>();
  for (const s of samplerJson.samples ?? []) {
    const path = s?.metadata?.originalPath;
    nameById.set(s.id, path ? basename(path) : `sample-${s.id}.wav`);
  }

  const pads: KoalaPadRef[] = (samplerJson.pads ?? [])
    .filter((p: any) => p.type === "sample" && typeof p.sampleId === "number")
    .map((p: any) => ({
      pad: Number(p.pad),
      sampleId: p.sampleId as number,
      fileName: nameById.get(p.sampleId) ?? `sample-${p.sampleId}.wav`,
    }))
    .sort((a: KoalaPadRef, b: KoalaPadRef) => a.pad - b.pad);

  if (!pads.length) throw new Error("No sample pads found in this Koala project.");

  return { zip, samplerJson, songJson, sequenceJson, originalName: file.name, pads };
}

/** Pulls a pad's audio out of the zip as a real File, ready to feed into the normal upload pipeline. */
export async function koalaPadToFile(project: ParsedKoalaProject, pad: KoalaPadRef): Promise<File> {
  const entry = project.zip.file(`sampler/${pad.sampleId}.wav`);
  if (!entry) throw new Error(`Missing audio for sample ${pad.sampleId} in this Koala project.`);
  const blob = await entry.async("blob");
  return new File([blob], pad.fileName, { type: "audio/wav" });
}

interface KoalaReplacement {
  sampleId: number;
  blob: Blob;
  frameCount: number;
}

export interface KoalaProjectTarget {
  /** Master loop's key, mirrored into song.json's keyboard scale lock. */
  scale?: "major" | "minor";
  /** Master loop's tempo, written into sequence.json so playback matches the tuned pads. */
  bpm?: number;
}

/** Koala's keyboardScale strings, as found in a real export (PascalCase, "NaturalMinor" for minor). */
const KEYBOARD_SCALE: Record<"major" | "minor", string> = {
  major: "Major",
  minor: "NaturalMinor",
};

/**
 * Rebuilds the project zip with tuned pad audio swapped in — same zip paths
 * and sample IDs throughout, so sampler.json's pad->sample mapping stays
 * valid. Start/end trim points are updated to match the new file lengths,
 * and each replaced pad's pitch knob is zeroed (the tuning is already baked
 * into the audio, so a leftover knob value would just double up/confuse).
 * The master loop's own pad is never touched — it isn't in `replacements`.
 */
async function buildTunedKoalaFile(
  project: ParsedKoalaProject,
  replacements: KoalaReplacement[],
  target: KoalaProjectTarget,
): Promise<{ blob: Blob; filename: string }> {
  const samplerJson = JSON.parse(JSON.stringify(project.samplerJson));
  const byId = new Map(replacements.map((r) => [r.sampleId, r]));

  for (const pad of samplerJson.pads ?? []) {
    const r = byId.get(pad.sampleId);
    if (!r) continue;
    pad.start = 0;
    pad.zoomStart = 0;
    pad.end = r.frameCount;
    pad.zoomEnd = r.frameCount;
    pad.pitch = 0;
  }

  for (const r of replacements) {
    project.zip.file(`sampler/${r.sampleId}.wav`, r.blob);
  }
  project.zip.file("sampler/sampler.json", JSON.stringify(samplerJson));

  if (project.songJson && target.scale) {
    const songJson = JSON.parse(JSON.stringify(project.songJson));
    songJson.keyboardMode = true;
    songJson.keyboardScale = KEYBOARD_SCALE[target.scale];
    project.zip.file("song.json", JSON.stringify(songJson));
  }

  if (project.sequenceJson && target.bpm && Number.isFinite(target.bpm)) {
    const sequenceJson = JSON.parse(JSON.stringify(project.sequenceJson));
    sequenceJson.bpm = target.bpm;
    project.zip.file("sequence.json", JSON.stringify(sequenceJson));
  }

  const blob = await project.zip.generateAsync({ type: "blob" });
  const dot = project.originalName.lastIndexOf(".");
  const base = dot > 0 ? project.originalName.slice(0, dot) : project.originalName;
  return { blob, filename: `${base}_tuned.koala` };
}

/** Only tuned-and-processed pads get swapped; drum pads and untouched pads keep their original bytes. */
export async function downloadTunedKoalaProject(
  project: ParsedKoalaProject,
  samples: SampleItem[],
  target: KoalaProjectTarget,
): Promise<void> {
  const replacements: KoalaReplacement[] = [];
  for (const s of samples) {
    if (s.koalaSampleId === undefined || s.mode !== "tune" || !s.processedChannelData) continue;
    const blob = encodeWav({ sampleRate: s.sampleRate, channelData: s.processedChannelData, bitDepth: 24 });
    replacements.push({ sampleId: s.koalaSampleId, blob, frameCount: s.processedChannelData[0].length });
  }
  const { blob, filename } = await buildTunedKoalaFile(project, replacements, target);
  downloadBlob(blob, filename);
}
