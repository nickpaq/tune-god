import { encodeWav } from "./wavEncode";
import { categoryById, type CategoryId } from "./classify";
import type { ParsedKoalaProject } from "./koalaProject";

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
 * gain-adjusted keep their trim points. With `resetGain`, every replaced pad's
 * volume knob (`vol`, 1 = 0 dB) is reset to unity too (the level is baked into the audio). `colors` maps sampleId to a sound category whose Koala colour and label replace the pad's own. `pans` maps sampleId to a Koala pan value
 * (0..1, 0.5 = centre) written to every pad using that sample.
 */
export async function buildTunedKoala(
  project: ParsedKoalaProject,
  tuned: TunedSample[],
  {
    resetGain = false,
    pans,
    colors,
  }: { resetGain?: boolean; pans?: Map<number, number>; colors?: Map<number, CategoryId> } = {},
): Promise<{ blob: Blob; filename: string }> {
  const byId = new Map(tuned.map((t) => [t.sampleId, t]));
  const samplerJson = JSON.parse(JSON.stringify(project.samplerJson));

  for (const pad of samplerJson.pads ?? []) {
    const pan = pans?.get(pad.sampleId);
    if (pan !== undefined) pad.pan = pan;
    const category = colors?.get(pad.sampleId);
    if (category) {
      const c = categoryById(category);
      pad.color = c.koalaColor;
      pad.label = c.koalaLabel;
    }
    const t = byId.get(pad.sampleId);
    if (!t) continue;
    if (resetGain) pad.vol = 1;
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
