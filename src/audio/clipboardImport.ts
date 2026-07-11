import JSZip from "jszip";

export const clipboardReadSupported = typeof navigator !== "undefined" && !!navigator.clipboard?.read;

/**
 * Pulls a .koala project out of the system clipboard (e.g. after using
 * Koala's share-sheet "Copy" action). The clipboard doesn't tell us which
 * MIME type Koala used, so every non-text type is tried and the first one
 * that parses as a zip containing sampler/sampler.json wins.
 */
export async function readKoalaFileFromClipboard(): Promise<File> {
  if (!navigator.clipboard?.read) {
    throw new Error("This browser can't read files from the clipboard. Use the file picker instead.");
  }

  const items = await navigator.clipboard.read();
  const seenTypes: string[] = [];

  for (const item of items) {
    for (const type of item.types) {
      seenTypes.push(type);
      if (type.startsWith("text/")) continue;
      const blob = await item.getType(type);
      const file = await tryAsKoalaProject(blob);
      if (file) return file;
    }
  }

  throw new Error(
    seenTypes.length
      ? `Clipboard doesn't contain a Koala project (found: ${seenTypes.join(", ")}). Try Copy again in Koala's share sheet.`
      : "Clipboard is empty. In Koala, use the share sheet's Copy action, then try pasting again.",
  );
}

/** Same MIME-type guessing as the clipboard path, for a `paste` DOM event's clipboardData.files. */
export async function findKoalaFileInFileList(files: FileList | File[]): Promise<File | null> {
  for (const f of Array.from(files)) {
    const file = await tryAsKoalaProject(f);
    if (file) return file;
  }
  return null;
}

async function tryAsKoalaProject(blob: Blob): Promise<File | null> {
  try {
    const zip = await JSZip.loadAsync(blob);
    if (!zip.file("sampler/sampler.json")) return null;
    return new File([blob], "pasted-project.koala", { type: blob.type || "application/zip" });
  } catch {
    return null;
  }
}
