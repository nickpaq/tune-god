import JSZip from "jszip";
import { encodeWav } from "./wavEncode";
import type { MasterItem, SampleItem } from "../state/samplesStore";

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

function masterFileName(master: MasterItem): string {
  return /\.\w+$/.test(master.name) ? master.name : `${master.name}.wav`;
}

/** Whether a sample currently has exportable audio (tuned samples need processing first). */
export function isExportable(sample: SampleItem): boolean {
  return sample.mode === "drum" || !!sample.processedChannelData;
}

export function sampleToWavBlob(sample: SampleItem): Blob {
  return encodeWav({ sampleRate: sample.sampleRate, channelData: outputChannelData(sample) });
}

export function masterToWavBlob(master: MasterItem): Blob {
  return encodeWav({ sampleRate: master.sampleRate, channelData: master.channelData });
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

export async function downloadAllAsZip(
  samples: SampleItem[],
  master: MasterItem | null,
  zipName = "tune-god-export.zip",
): Promise<void> {
  const zip = new JSZip();
  if (master) {
    zip.file(masterFileName(master), masterToWavBlob(master));
  }
  for (const sample of samples) {
    zip.file(outputFileName(sample), sampleToWavBlob(sample));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

/**
 * Triggers a separate browser download for every file instead of zipping —
 * some browsers throttle/prompt after a handful of rapid downloads, so
 * these are staggered slightly.
 */
export async function downloadAllIndividually(samples: SampleItem[], master: MasterItem | null): Promise<void> {
  if (master) {
    downloadBlob(masterToWavBlob(master), masterFileName(master));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  for (const sample of samples) {
    downloadBlob(sampleToWavBlob(sample), outputFileName(sample));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export interface DragExportItem {
  filename: string;
  blob: Blob;
}

export function sampleDragItem(sample: SampleItem): DragExportItem | null {
  if (!isExportable(sample)) return null;
  return { filename: outputFileName(sample), blob: sampleToWavBlob(sample) };
}

export function masterDragItem(master: MasterItem): DragExportItem {
  return { filename: masterFileName(master), blob: masterToWavBlob(master) };
}

export function collectDragExportItems(samples: SampleItem[], master: MasterItem | null): DragExportItem[] {
  const items: DragExportItem[] = [];
  if (master) items.push(masterDragItem(master));
  for (const sample of samples) {
    const item = sampleDragItem(sample);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Populates a native drag payload so files can be dropped straight into
 * another app (DAW, Finder/Explorer, etc). Relies on the Chromium
 * "DownloadURL" drag convention (mime:filename:url per line) — it degrades
 * silently to a no-op drag on browsers that don't support it (e.g. Firefox).
 */
export function startFileDrag(dataTransfer: DataTransfer, items: DragExportItem[]): void {
  if (!items.length) return;
  const entries = items.map(({ filename, blob }) => {
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    const safeName = filename.replace(/:/g, "-");
    return `${blob.type || "audio/wav"}:${safeName}:${url}`;
  });
  dataTransfer.setData("DownloadURL", entries.join("\n"));
  dataTransfer.effectAllowed = "copy";
}
