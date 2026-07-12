import JSZip from "jszip";

/** Same MIME-type guessing as Koala's share-sheet "Copy" action, for a `paste` DOM event's clipboardData.files. */
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
