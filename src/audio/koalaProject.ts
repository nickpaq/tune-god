// A .koala project (Koala Sampler, iOS) is a zip archive under the hood —
// sampler/sampler.json holds the pad grid + per-sample metadata, and each
// pad's audio lives at sampler/{sampleId}.wav. We read/write that structure
// directly from the zip bytes; the .koala extension is cosmetic (JSZip
// doesn't care what the file is called), so no literal rename is needed.
import JSZip from "jszip";

export interface KoalaPadRef {
  /** 0-based slot: bank = floor(pad / 16), row-major within the bank. */
  pad: number;
  sampleId: number;
  /** Friendly name for the UI, derived from the sample's original import path when available. */
  fileName: string;
  sourcePath?: string;
  /** The label on the pad in Koala (what the pad shows), or "" when it has none. */
  label?: string;
}

export interface ParsedKoalaProject {
  zip: JSZip;
  samplerJson: any;
  originalName: string;
  pads: KoalaPadRef[];
  /** 1 when the project counts pads from 1, else 0; pad numbers in the file are this much higher. */
  padBase: number;
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

  const nameById = new Map<number, string>();
  const pathById = new Map<number, string>();
  for (const s of samplerJson.samples ?? []) {
    const path = s?.metadata?.originalPath;
    nameById.set(s.id, path ? basename(path) : `sample-${s.id}.wav`);
    const sourcePath = s?.metadata?.sourcePath ?? path;
    if (typeof sourcePath === "string") pathById.set(s.id, sourcePath);
  }

  // Pad numbers are normalized to 0-based grid slots (some exports count from 1).
  const allNumbers: number[] = (samplerJson.pads ?? []).map((p: any) => Number(p.pad)).filter(Number.isFinite);
  const padBase = allNumbers.length && Math.min(...allNumbers) >= 1 ? 1 : 0;

  const pads: KoalaPadRef[] = (samplerJson.pads ?? [])
    .filter((p: any) => p.type === "sample" && typeof p.sampleId === "number")
    .map((p: any) => ({
      pad: Number(p.pad) - padBase,
      sampleId: p.sampleId as number,
      fileName: nameById.get(p.sampleId) ?? `sample-${p.sampleId}.wav`,
      sourcePath: pathById.get(p.sampleId),
      label: typeof p.label === "string" ? p.label.trim() : "",
    }))
    .sort((a: KoalaPadRef, b: KoalaPadRef) => a.pad - b.pad);

  if (!pads.length) throw new Error("No sample pads found in this Koala project.");

  return { zip, samplerJson, originalName: file.name, pads, padBase };
}

/** Pulls a pad's audio out of the zip as a real File, ready to feed into the normal upload pipeline. */
export async function koalaPadToFile(project: ParsedKoalaProject, pad: KoalaPadRef): Promise<File> {
  const entry = project.zip.file(`sampler/${pad.sampleId}.wav`);
  if (!entry) throw new Error(`Missing audio for sample ${pad.sampleId} in this Koala project.`);
  const blob = await entry.async("blob");
  return new File([blob], pad.fileName, { type: "audio/wav" });
}

/**
 * The trim points (in frames) Koala has on a sample's pad, or null when they are missing, invalid
 * or already cover the whole file. Used to cut the audio down to what the pad actually plays
 * before it is repitched, so the trim points survive in the new file.
 */
export function trimRangeOf(project: ParsedKoalaProject, sampleId: number, totalFrames: number): { start: number; end: number } | null {
  const pad = (project.samplerJson.pads ?? []).find((p: any) => p.type === "sample" && p.sampleId === sampleId);
  const start = Math.max(0, Math.round(Number(pad?.start)));
  const end = Math.min(totalFrames, Math.round(Number(pad?.end)));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 1) return null;
  if (start === 0 && end === totalFrames) return null;
  return { start, end };
}

/** The project's tempo and time signature, from its sequence settings (4/4 at 120 when it has none). */
export async function projectTimeSignature(project: ParsedKoalaProject): Promise<{ bpm: number; beatsPerBar: number }> {
  try {
    const entry = project.zip.file("sequence.json");
    const sequence = entry ? JSON.parse(await entry.async("string")) : null;
    const beatsPerBar = Math.round(Number(sequence?.beatsPerBar));
    const bpm = Number(sequence?.bpm);
    return { bpm: bpm > 0 ? bpm : 120, beatsPerBar: beatsPerBar >= 1 && beatsPerBar <= 16 ? beatsPerBar : 4 };
  } catch {
    return { bpm: 120, beatsPerBar: 4 };
  }
}
