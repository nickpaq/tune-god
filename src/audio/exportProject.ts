import { encodeWav } from "./wavEncode";
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
 * gain-adjusted keep their trim points. `vols` maps sampleId to the pad's
 * volume knob (`vol`, linear: 1 = 0 dB), written to every pad using that sample, replaced or not. `buses` maps sampleId to a bus index (see BUS_MAIN and friends in routing.ts). `colors` maps sampleId to the hex colour and label that replace the pad's own. `pans` maps sampleId to a Koala pan value
 * (0..1, 0.5 = centre) written to every pad using that sample.
 */
export async function buildTunedKoala(
  project: ParsedKoalaProject,
  tuned: TunedSample[],
  {
    vols,
    buses,
    pans,
    colors,
  }: { vols?: Map<number, number>; buses?: Map<number, number>; pans?: Map<number, number>; colors?: Map<number, { color: string; label: string }> } = {},
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
