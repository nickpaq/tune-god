// Bank D, the acapella: a separate Koala project that holds only a song and its vocal stem (from Koala's stem split). Loading it does not
// open it as the project: the two sounds are taken out of it and handed to the chop editor, where the cuts are tapped out on the full
// song and made on the isolated vocals (see docs/song-chop.md). The sections the chop makes are what go on bank D.
import type { Pad } from "../components/PadPanel";
import { decodeNative } from "./decode";
import { koalaPadToFile, parseKoalaProject, projectTimeSignature, trimRangeOf } from "./koalaProject";
import { songTemplate, type SongTemplate } from "./exportSong";
import { checkStems, isVocalsName, padTitle } from "./song/stems";

export interface Acapella {
  song: Pad;
  vocals: Pad;
  beatsPerBar: number;
  /** The vocal stem's own pad and sample entry in the acapella project, which every section pad starts from in the export. */
  template: SongTemplate | undefined;
}

/** What reading an acapella project found: the two sounds, or what is wrong with the project, for an alert. */
export type AcapellaResult = { ok: true; acapella: Acapella } | { ok: false; message: string };

/**
 * Takes the song and its vocal stem out of an acapella project. The vocal stem is the pad labelled like the song with VOCALS after it
 * (`checkStems`); the project may hold only those two, so every sound in it is read.
 */
export async function readAcapellaZip(file: File): Promise<AcapellaResult> {
  let project;
  try {
    project = await parseKoalaProject(file);
  } catch {
    return { ok: false, message: "That file is not a Koala project (a .koala or .zip with a sampler inside)." };
  }
  const sounds = project.pads.filter((p) => p.pad >= 0 && p.fileName !== "silence.wav");
  if (sounds.length < 2) {
    return { ok: false, message: "An acapella project needs two sounds: the song and its vocal stem, labelled like the song with VOCALS after it. This one has fewer." };
  }
  const pads: Pad[] = [];
  for (const ref of sounds) {
    const decoded = await decodeNative(await koalaPadToFile(project, ref));
    // Koala plays only between the pad's start and end points.
    const range = trimRangeOf(project, ref.sampleId, decoded.channelData[0].length);
    const channelData = range ? decoded.channelData.map((ch) => ch.slice(range.start, range.end)) : decoded.channelData;
    pads.push({ index: -1, origIndex: ref.pad, name: ref.fileName, label: ref.label || undefined, sampleId: ref.sampleId, sampleRate: decoded.sampleRate, channelData, tune: false, semis: 0, cents: 0 });
  }
  const tapped = pads.find((p) => isVocalsName(padTitle(p))) ?? pads[0];
  const check = checkStems(tapped, pads);
  if (!check.ok) return { ok: false, message: check.message };
  const { beatsPerBar } = await projectTimeSignature(project);
  return { ok: true, acapella: { song: check.song, vocals: check.vocals, beatsPerBar, template: songTemplate(project.samplerJson, check.vocals.sampleId) } };
}
