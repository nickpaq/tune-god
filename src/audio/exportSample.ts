import JSZip from "jszip";
import { encodeWav } from "./wavEncode";
import type { SampleItem } from "../state/samplesStore";

function outputChannelData(sample: SampleItem): Float32Array[] {
  if (sample.mode === "drum") return sample.channelData;
  return sample.processedChannelData ?? sample.channelData;
}

function outputFileName(sample: SampleItem): string {
  const dot = sample.name.lastIndexOf(".");
  const base = dot > 0 ? sample.name.slice(0, dot) : sample.name;
  const suffix = sample.mode === "drum" ? "" : "_tuned";
  return `${base}${suffix}.wav`;
}

export function sampleToWavBlob(sample: SampleItem): Blob {
  return encodeWav({ sampleRate: sample.sampleRate, channelData: outputChannelData(sample) });
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

export function downloadSample(sample: SampleItem): void {
  downloadBlob(sampleToWavBlob(sample), outputFileName(sample));
}

export async function downloadAllAsZip(samples: SampleItem[], zipName = "tune-god-export.zip"): Promise<void> {
  const zip = new JSZip();
  for (const sample of samples) {
    zip.file(outputFileName(sample), sampleToWavBlob(sample));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}
