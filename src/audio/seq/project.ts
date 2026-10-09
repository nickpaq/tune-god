import type JSZip from "jszip";
import { writeArrangement, type SeqArrangement } from "./model";

const EDITOR_ENTRY = "tunegod/sequencer.json";

/** Both the playable native sequence and its editable lane layout live in the .koala archive. */
export async function saveArrangementToKoala(zip: JSZip, arrangement: SeqArrangement, beatsPerBar: number, padBase: number, slot = 0): Promise<void> {
  const entry = zip.file("sequence.json");
  const sequence = entry ? JSON.parse(await entry.async("string")) : {};
  const native = writeArrangement(sequence, arrangement, beatsPerBar, padBase, slot);
  const editor = { version: 1, slot, beatsPerBar, arrangement };
  // Serialize both before modifying the archive, so validation failures leave it intact.
  const nativeJson = JSON.stringify(native), editorJson = JSON.stringify(editor);
  zip.file("sequence.json", nativeJson);
  zip.file(EDITOR_ENTRY, editorJson);
}

export async function readArrangementFromKoala(zip: JSZip): Promise<{ arrangement: SeqArrangement; beatsPerBar: number; slot: number } | null> {
  const entry = zip.file(EDITOR_ENTRY);
  if (!entry) return null;
  const saved = JSON.parse(await entry.async("string"));
  if (saved.version !== 1 || !Array.isArray(saved.arrangement?.lanes) || !Array.isArray(saved.arrangement?.sections)) throw new Error("Unsupported TuneGod sequencer layout");
  // Reuse native compilation validation without changing the archive.
  writeArrangement({}, saved.arrangement, saved.beatsPerBar, 0, saved.slot);
  return { arrangement: saved.arrangement, beatsPerBar: saved.beatsPerBar, slot: saved.slot };
}
