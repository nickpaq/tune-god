import JSZip from "jszip";
import type { ParsedKoalaProject } from "./koalaProject";

/** Give a copied trigger its own pad and sample identities so tuning/export never changes its source. */
export async function copyProjectPad(project: ParsedKoalaProject, sourceIndex: number) {
  const source = project.pads.find((pad) => pad.pad === sourceIndex);
  const raw = project.samplerJson.pads?.find((pad: any) => Number(pad.pad) - project.padBase === sourceIndex);
  const audio = source && project.zip.file(`sampler/${source.sampleId}.wav`);
  if (!source || !raw || !audio) throw new Error("The source sound is unavailable. Reconnect your files first.");
  const json = structuredClone(project.samplerJson);
  const origIndex = Math.max(-1, ...json.pads.map((pad: any) => Number(pad.pad) - project.padBase)) + 1;
  const sampleId = Math.max(-1, ...(json.samples ?? []).map((sample: any) => Number(sample.id)), ...json.pads.map((pad: any) => Number(pad.sampleId) || 0)) + 1;
  // Isolate the entry map while sharing immutable ZIP data. Avoid serializing and
  // re-reading the whole project just to add one pad (large projects exhaust mobile RAM).
  const zip = new JSZip();
  zip.files = { ...project.zip.files };
  (zip as JSZip & { comment: string | null }).comment = (project.zip as JSZip & { comment: string | null }).comment;
  zip.file(`sampler/${sampleId}.wav`, await audio.async("uint8array"));
  const metadata = json.samples?.find((sample: any) => sample.id === source.sampleId);
  json.samples = [...(json.samples ?? []), { ...structuredClone(metadata ?? {}), id: sampleId }];
  json.pads.push({ ...structuredClone(raw), pad: origIndex + project.padBase, sampleId });
  zip.file("sampler/sampler.json", JSON.stringify(json));
  const ref = { ...source, pad: origIndex, sampleId };
  const next: ParsedKoalaProject = { ...project, zip, samplerJson: json, pads: [...project.pads, ref] };
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true });
  return { project: next, ref, file: new File([blob], project.originalName, { type: "application/octet-stream" }) };
}
