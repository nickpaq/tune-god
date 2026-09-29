import { encodeWav } from "./wavEncode";
import type { ParsedKoalaProject } from "./koalaProject";

export interface TunedSample {
  sampleId: number;
  sampleRate: number;
  channelData: Float32Array[];
}

/**
 * Rebuilds the project zip with the tuned samples swapped in — same zip paths
 * and sample IDs, so sampler.json's pad->sample mapping stays valid. Each
 * replaced pad's trim points are reset to the new file length and its pitch
 * knob zeroed (the tuning is baked into the audio now). Untouched samples
 * keep their original bytes.
 */
export async function buildTunedKoala(
  project: ParsedKoalaProject,
  tuned: TunedSample[],
): Promise<{ blob: Blob; filename: string }> {
  const byId = new Map(tuned.map((t) => [t.sampleId, t]));
  const samplerJson = JSON.parse(JSON.stringify(project.samplerJson));

  for (const pad of samplerJson.pads ?? []) {
    const t = byId.get(pad.sampleId);
    if (!t) continue;
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
  project.zip.file("sampler/sampler.json", JSON.stringify(samplerJson));

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
