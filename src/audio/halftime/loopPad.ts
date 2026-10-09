import { encodeWav } from "../wavEncode";
import { parseKoalaProject } from "../koalaProject";
import type { Pad } from "../../components/PadPanel";
/** Melodic loops occupy Bank B's first twelve pads, excluding the bass/808 row. */
export const MELODIC_LOOP_SLOTS = Array.from({ length: 12 }, (_, i) => 16 + i);
export function freeHalftimeLoopSlot(pads: Record<number, Pad>): number | null {
  return MELODIC_LOOP_SLOTS.find(index => !pads[index] || (!pads[index].locked && !!pads[index].placeholder)) ?? null;
}
export function halftimeLabel(bpm: number, frames: number, rate: number, beatsPerBar: number): string {
  const bars = frames / rate * bpm / 60 / beatsPerBar;
  return `Half · ${+bpm.toFixed(2)} BPM · ${+bars.toFixed(2)} bar${Math.abs(bars - 1) < 0.005 ? "" : "s"}`;
}

/** Add a new WAV to a copied archive before the UI replaces any pad. Originals remain in the copy. */
export async function stageHalftimeLoop(project: import("../koalaProject").ParsedKoalaProject, bounce: { channelData: Float32Array[]; sampleRate: number; bpm: number; name: string }, beatsPerBar: number) {
  const copy = await parseKoalaProject(new File([await project.zip.generateAsync({ type: "blob" })], project.originalName));
  const samples: any[] = copy.samplerJson.samples ?? [];
  const pads: any[] = copy.samplerJson.pads ?? [];
  let sampleId = Math.max(0, ...samples.map(s => Number(s.id)).filter(Number.isFinite), ...pads.map(p => Number(p.sampleId)).filter(Number.isFinite)) + 1;
  while (copy.zip.file(`sampler/${sampleId}.wav`)) sampleId++;
  const origIndex = Math.max(64, ...pads.map(p => Number(p.pad) - copy.padBase + 1));
  const bytes = await encodeWav({ channelData: bounce.channelData, sampleRate: bounce.sampleRate, bitDepth: 24 }).arrayBuffer();
  if (bytes.byteLength <= 44) throw new Error("No bounced audio was written. Source kept.");
  copy.zip.file(`sampler/${sampleId}.wav`, bytes);
  if ((await copy.zip.file(`sampler/${sampleId}.wav`)!.async("uint8array")).byteLength !== bytes.byteLength) throw new Error("Bounce could not be verified. Source kept.");
  const label = halftimeLabel(bounce.bpm, bounce.channelData[0].length, bounce.sampleRate, beatsPerBar);
  const name = `Loop_Halftime_${+bounce.bpm.toFixed(2)}bpm_${bounce.name.replace(/\.[^.]+$/, "")}.wav`;
  samples.push({ id: sampleId, metadata: { originalPath: name, bpm: bounce.bpm, source: "Halftime" } });
  pads.push({ pad: origIndex + copy.padBase, type: "sample", sampleId, label, bus: 3, vol: 1, pan: 0.5, pitch: 0,
    start: 0, end: bounce.channelData[0].length, zoomStart: 0, zoomEnd: bounce.channelData[0].length, oneshot: false, looping: false, stretching: false });
  copy.samplerJson.samples = samples; copy.samplerJson.pads = pads;
  copy.zip.file("sampler/sampler.json", JSON.stringify(copy.samplerJson));
  const file = new File([await copy.zip.generateAsync({ type: "blob", compression: "STORE" })], copy.originalName);
  const saved = await parseKoalaProject(file);
  if (!saved.pads.some(p => p.sampleId === sampleId) || !saved.zip.file(`sampler/${sampleId}.wav`)) throw new Error("Saved bounce could not be read back. Source kept.");
  return { file, project: saved, sampleId, origIndex, label, name };
}
