import { applyGainDb } from "./gain";
import type { PadEq, PadPlayback } from "./padSettings";
import { encodeWav } from "./wavEncode";
import type { ParsedKoalaProject } from "./koalaProject";
import type { MasterStyle } from "./mixPresets";
import { appendAfterExisting, bassSidechain, kickClipper, melodicEq, masterChain as masterChainEffects, type MixerSlot } from "./mixerChain";
import { BUS_NAMES } from "./routing";
import { addChopperPad, type ChopperExport } from "./exportChopper";
import { addSongSections, emptySequence, SEQUENCE_SLOTS, songTemplate, type SongExport } from "./exportSong";

/** A ghost snare or soft kick the layout adds: a quieter copy of another pad, written as its own sample. */
export interface GhostPadExport {
  index: number;
  label: string;
  /** Replaces the pad's colour; omitted keeps the source pad's own. */
  color?: string;
  /** The pad (by sample id) this is a copy of; its settings are cloned. */
  sourceSampleId: number;
  sampleRate: number;
  /** The finished audio, already quieter and duller than the source. */
  channelData: Float32Array[];
}

export interface TunedSample {
  sampleId: number;
  sampleRate: number;
  channelData: Float32Array[];
  /** True when the audio length changed (pitch-shifted), so trim points and the pitch knob must be reset. */
  retimed: boolean;
  /** Frames cut from the front when the project was loaded; the written file starts at the pad's old start point, so its trim points reset (and a loop point moves back by this much). */
  trimmedFrom?: number;
  /** Gain baked into the file while it is encoded, so no gained copy of the audio is ever held. */
  gainDb?: number;
}

/**
 * Rebuilds the project zip with the tuned samples swapped in — same zip paths
 * and sample IDs, so sampler.json's pad->sample mapping stays valid. Each
 * retimed pad's trim points are reset to the new file length and its pitch
 * knob zeroed (the tuning is baked into the audio now). Samples that were only
 * gain-adjusted keep their trim points. `vols` maps sampleId to the pad's
 * volume knob (`vol`, linear: 1 = 0 dB), written to every pad using that sample, replaced or not. `arrangement` maps each pad's original slot to its new slot, or null when the user deleted it; it renumbers the pads, remaps recorded sequence notes and drops deleted sounds' audio. `sidechain` and `masterChain` add the bass-bus sidechain and the master chain (see mixerChain.ts). `buses` maps sampleId to a bus index (see BUS_MAIN and friends in routing.ts). `colors` maps sampleId to the hex colour and label that replace the pad's own. `pans` maps sampleId to a Koala pan value
 * (0..1, 0.5 = centre) written to every pad using that sample.
 */
export async function buildTunedKoala(
  project: ParsedKoalaProject,
  tuned: TunedSample[],
  {
    vols,
    buses,
    busNames,
    sidechain,
    masterChain,
    masterStyle,
    arrangement,
    pans,
    colors,
    playback,
    ghosts,
    song,
    chopper,
    bpm,
    stretch,
  }: { vols?: Map<number, number>; buses?: Map<number, number>; busNames?: string[]; sidechain?: boolean; masterChain?: boolean; masterStyle?: MasterStyle; arrangement?: Map<number, number | null>; pans?: Map<number, number>; colors?: Map<number, { color: string; label: string }>; playback?: Map<number, PadPlayback>; ghosts?: GhostPadExport[]; song?: SongExport; chopper?: ChopperExport; bpm?: number; stretch?: Map<number, number> } = {},
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
    const play = playback?.get(pad.sampleId);
    if (play) {
      if (play.chokeGroup !== undefined) pad.chokeGroup = play.chokeGroup;
      // Koala writes some booleans as strings; keep whichever style the pad already uses.
      if (play.oneShot !== undefined) pad.oneshot = typeof pad.oneshot === "boolean" ? play.oneShot : String(play.oneShot);
      if (play.loop !== undefined) pad.looping = typeof pad.looping === "boolean" ? play.loop : String(play.loop);
      if (play.release !== undefined) pad.release = play.release;
      if (play.eq) applyPadEq(pad, play.eq);
    }
    const beats = stretch?.get(pad.sampleId);
    if (beats !== undefined) {
      // Koala writes some booleans as strings; keep whichever style the pad already uses.
      pad.stretching = typeof pad.stretching === "string" ? "true" : true;
      pad.stretchLength = beats;
    }
    const tint = colors?.get(pad.sampleId);
    if (tint) {
      pad.color = tint.color;
      pad.label = tint.label;
    }
    const t = byId.get(pad.sampleId);
    if (!t) continue;
    if (!t.retimed && t.trimmedFrom === undefined) continue;
    const frames = t.channelData[0].length;
    // A loop point is a frame in the old file, so it moves back with the cut.
    if (typeof pad.loopPoint === "number" && pad.loopPoint >= 0 && t.trimmedFrom !== undefined && !t.retimed) pad.loopPoint = Math.max(0, pad.loopPoint - t.trimmedFrom);
    if (!t.retimed) {
      Object.assign(pad, { start: 0, zoomStart: 0, end: frames, zoomEnd: frames });
      continue;
    }
    pad.start = 0;
    pad.zoomStart = 0;
    pad.end = frames;
    pad.zoomEnd = frames;
    pad.pitch = 0;
  }

  for (const t of tuned) {
    const channelData = t.gainDb ? applyGainDb(t.channelData, t.gainDb) : t.channelData;
    project.zip.file(`sampler/${t.sampleId}.wav`, encodeWav({ sampleRate: t.sampleRate, channelData, bitDepth: 24 }));
    t.channelData = []; // the WAV holds it now; let the floats go
  }
  // The song's own pad is usually deleted by the arrangement, so its settings are taken before that.
  const template = song ? (song.template ?? songTemplate(samplerJson, song.sourceSampleId)) : undefined;
  if (arrangement) await applyArrangement(project, samplerJson, arrangement);
  if (ghosts?.length) await addGhostPads(project, samplerJson, ghosts);
  if (song?.sections.length) await addSongSections(project, samplerJson, song, template);
  if (chopper) await addChopperPad(project, samplerJson, chopper);
  project.zip.file("sampler/sampler.json", JSON.stringify(samplerJson));
  if (bpm !== undefined) await writeBpm(project, bpm);
  if (busNames || sidechain || masterChain) await setupMixer(project, { names: busNames, sidechain, kickClip: sidechain, melodicEq: sidechain, master: masterChain, masterStyle });

  const blob = await project.zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 }, streamFiles: true });
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

/**
 * Koala's per-pad EQ (`pad.eq`: lo highpass, mid peaking, hi highshelf). Sets the highpass frequency and, when asked, the high shelf's
 * gain, keeping every other band setting the pad already has. A pad with no EQ gets Koala's defaults first.
 */
function applyPadEq(pad: any, eq: PadEq): void {
  const base = { enabled: "true", lo: { type: "highpass", freq: 20, gain: -18, q: 1 }, mid: { type: "peaking", freq: 1000, gain: 0, q: 1 }, hi: { type: "highshelf", freq: 8000, gain: 0, q: 1 } };
  const cur = pad.eq ?? base;
  pad.eq = { ...base, ...cur, enabled: typeof cur.enabled === "boolean" ? true : "true", lo: { ...base.lo, ...cur.lo, freq: eq.highpassHz }, hi: { ...base.hi, ...cur.hi, ...(eq.highShelfDb !== undefined ? { gain: eq.highShelfDb } : {}) } };
}

/** The project tempo, in sequence.json (a project that has none gets Koala's default settings around it). */
export async function writeBpm(project: ParsedKoalaProject, bpm: number): Promise<void> {
  const entry = project.zip.file("sequence.json");
  const sequence = entry ? JSON.parse(await entry.async("string")) : { autoPlay: "next", beatsPerBar: 4, currSequenceId: 0, quantizeDivision: 16, quantizing: true, seqSnap: "Sequence", sequences: Array.from({ length: SEQUENCE_SLOTS }, emptySequence), swing: 0 };
  sequence.bpm = bpm;
  project.zip.file("sequence.json", JSON.stringify(sequence));
}

/** A mixer strip as Koala writes it: five empty effect slots, unmuted, at 0 dB. */
const emptyStrip = (name: string) => ({ chain: [null, null, null, null, null], mute: false, name, solo: false, volume: 0 });

/**
 * Sets up the mixer in mixer.json: bus strip names, a sidechain from the kick bus onto the bass bus, a little clipping on the kick bus, an EQ on the melodic bus, and the master chain.
 * Each bus keeps its effects and levels, and a new effect goes after the last one already there; the master chain replaces the master
 * strip's plugins (the app warns first). A project that has never opened the mixer has no mixer.json, so one is created from Koala's own layout.
 */
async function setupMixer(project: ParsedKoalaProject, setup: { names?: string[]; sidechain?: boolean; master?: boolean; masterStyle?: MasterStyle; kickClip?: boolean; melodicEq?: boolean }): Promise<void> {
  const entry = project.zip.file("mixer.json");
  const mixer = entry ? JSON.parse(await entry.async("string")) : { buses: [], master: emptyStrip("MAIN") };
  mixer.buses = Array.isArray(mixer.buses) ? mixer.buses : [];
  setup.names?.forEach((name, i) => {
    mixer.buses[i] = { ...(mixer.buses[i] ?? emptyStrip(name)), name };
  });
  if (setup.sidechain) {
    const bass = (mixer.buses[1] ??= emptyStrip(BUS_NAMES[1]));
    bass.chain = Array.isArray(bass.chain) ? bass.chain : [null, null, null, null, null];
    if (!bass.chain.some((fx: MixerSlot) => fx?.name === "SIDECHAIN")) appendAfterExisting(bass.chain, [bassSidechain()]);
  }
  if (setup.kickClip) {
    const kick = (mixer.buses[0] ??= emptyStrip(BUS_NAMES[0]));
    kick.chain = Array.isArray(kick.chain) ? kick.chain : [null, null, null, null, null];
    if (!kick.chain.some((fx: MixerSlot) => fx?.name === "CLIPPER")) appendAfterExisting(kick.chain, [kickClipper()]);
  }
  if (setup.melodicEq) {
    const melodic = (mixer.buses[3] ??= emptyStrip(BUS_NAMES[3]));
    melodic.chain = Array.isArray(melodic.chain) ? melodic.chain : [null, null, null, null, null];
    if (!melodic.chain.some((fx: MixerSlot) => fx?.name === "EQ")) appendAfterExisting(melodic.chain, [melodicEq()]);
  }
  if (setup.master) {
    const master = (mixer.master ??= emptyStrip("MAIN"));
    master.chain = Array.isArray(master.chain) ? master.chain : [null, null, null, null, null];
    // The master chain replaces whatever the master strip held (the app warns before an export that would).
    const effects = masterChainEffects(setup.masterStyle);
    master.chain = [...effects, ...Array(Math.max(0, 5 - effects.length)).fill(null)];
  }
  project.zip.file("mixer.json", JSON.stringify(mixer));
}

/**
 * Pads that aren't samples (AUv3 plugin pads) aren't shown in the app, so the arrangement knows
 * nothing about them. Once the sounds are placed, each one moves to the first free pad in the melodic
 * banks (C, D), or further along if those are full. Any failure leaves that pad where it was. Moves are
 * added to `arrangement` so recorded notes follow the pad.
 */
function movePluginPads(kept: any[], base: number, arrangement: Map<number, number | null>): void {
  const plugins = kept.filter((p) => p.type !== "sample");
  if (!plugins.length) return;
  const occupied = new Set(kept.filter((p) => p.type === "sample").map((p) => Number(p.pad) - base));
  const free = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (!occupied.has(i)) return i;
    return null;
  };
  for (const pad of plugins) {
    const orig = Number(pad.pad) - base;
    try {
      if (!Number.isFinite(orig)) continue;
      const inMelodic = orig >= 32 && orig < 64;
      // Stays put when already in C/D and not covered by a sound.
      const to = inMelodic && !occupied.has(orig) ? orig : (free(32, 64) ?? (occupied.has(orig) ? free(0, 64) : orig));
      if (to === null || to === undefined) continue;
      occupied.add(to);
      if (to === orig) continue;
      pad.pad = typeof pad.pad === "number" ? to + base : String(to + base);
      arrangement.set(orig, to);
    } catch {
      occupied.add(orig);
    }
  }
}

/**
 * Applies the user's pad moves and deletions. Pad entries are renumbered (a pad's settings live in
 * its entry, so they move with it), notes in recorded sequences follow their pad (notes on a
 * deleted pad are dropped), and audio no remaining pad uses is removed from the archive.
 */
async function applyArrangement(project: ParsedKoalaProject, samplerJson: any, arrangement: Map<number, number | null>): Promise<void> {
  arrangement = new Map(arrangement);
  const base = project.padBase;
  const kept: any[] = [];
  const deletedIds = new Set<number>();
  for (const pad of samplerJson.pads ?? []) {
    const orig = Number(pad.pad) - base;
    if (pad.type !== "sample" || !arrangement.has(orig)) {
      kept.push(pad);
      continue;
    }
    const to = arrangement.get(orig);
    if (to === null || to === undefined) {
      deletedIds.add(pad.sampleId);
      continue;
    }
    pad.pad = typeof pad.pad === "number" ? to + base : String(to + base);
    kept.push(pad);
  }
  movePluginPads(kept, base, arrangement);
  kept.sort((a, b) => Number(a.pad) - Number(b.pad));
  samplerJson.pads = kept;

  const stillUsed = new Set(kept.filter((p) => p.type === "sample").map((p) => p.sampleId));
  for (const id of deletedIds) {
    if (stillUsed.has(id)) continue;
    project.zip.remove(`sampler/${id}.wav`);
    samplerJson.samples = (samplerJson.samples ?? []).filter((s: any) => s.id !== id);
  }

  const sequenceEntry = project.zip.file("sequence.json");
  if (sequenceEntry) {
    const sequence = JSON.parse(await sequenceEntry.async("string"));
    for (const seq of sequence.sequences ?? []) {
      const pattern = seq?.noteSequence?.pattern;
      if (!Array.isArray(pattern?.notes)) continue;
      pattern.notes = pattern.notes.filter((note: any) => {
        const orig = Number(note.num) - base;
        if (!arrangement.has(orig)) return true;
        const to = arrangement.get(orig);
        if (to === null || to === undefined) return false;
        note.num = to + base;
        return true;
      });
    }
    project.zip.file("sequence.json", JSON.stringify(sequence));
  }

  const songEntry = project.zip.file("song.json");
  if (songEntry) {
    const song = JSON.parse(await songEntry.async("string"));
    const to = typeof song.selectedPad === "number" ? arrangement.get(song.selectedPad - base) : undefined;
    if (to !== undefined) song.selectedPad = to === null ? base : to + base;
    project.zip.file("song.json", JSON.stringify(song));
  }
}

/**
 * Adds the layout's ghost snares and soft kicks. Each gets its own 24-bit WAV and its own sample entry,
 * and its pad is a clone of the source pad (bus, pan, everything Koala expects) with the trim points reset
 * and the volume knob at 0 dB, since the level is baked into the audio. A ghost whose slot is already taken, or whose source pad is gone, is skipped.
 */
async function addGhostPads(project: ParsedKoalaProject, samplerJson: any, ghosts: GhostPadExport[]): Promise<void> {
  const pads: any[] = (samplerJson.pads = Array.isArray(samplerJson.pads) ? samplerJson.pads : []);
  const samples: any[] = (samplerJson.samples = Array.isArray(samplerJson.samples) ? samplerJson.samples : []);
  const base = project.padBase;
  const ids = [...samples.map((s) => s.id), ...pads.map((p) => p.sampleId)].filter((id) => typeof id === "number");
  let nextId = Math.max(0, ...ids) + 1;
  const taken = new Set(pads.map((p) => Number(p.pad) - base));
  for (const g of ghosts) {
    const source = pads.find((p) => p.type === "sample" && p.sampleId === g.sourceSampleId);
    if (!source || taken.has(g.index)) continue;
    const sampleId = nextId++;
    const frames = g.channelData[0].length;
    project.zip.file(`sampler/${sampleId}.wav`, await encodeWav({ sampleRate: g.sampleRate, channelData: g.channelData, bitDepth: 24 }).arrayBuffer());
    const sourceSample = samples.find((s) => s.id === g.sourceSampleId);
    samples.push({
      ...(sourceSample ? JSON.parse(JSON.stringify(sourceSample)) : {}),
      id: sampleId,
      metadata: { ...(sourceSample?.metadata ?? {}), originalPath: `${g.label}.wav` },
    });
    const pad = JSON.parse(JSON.stringify(source));
    pad.pad = typeof source.pad === "string" ? String(g.index + base) : g.index + base;
    pad.sampleId = sampleId;
    pad.label = g.label;
    if (g.color) pad.color = g.color;
    if ("start" in pad) Object.assign(pad, { start: 0, zoomStart: 0, end: frames, zoomEnd: frames });
    if ("pitch" in pad) pad.pitch = 0;
    if ("vol" in pad) pad.vol = 1;
    pads.push(pad);
    taken.add(g.index);
  }
  pads.sort((a, b) => Number(a.pad) - Number(b.pad));
}

/** The names of the effects already on a project's master strip: the master chain would wipe them out. */
export async function masterEffectNames(project: ParsedKoalaProject): Promise<string[]> {
  const entry = project.zip.file("mixer.json");
  if (!entry) return [];
  try {
    const chain = JSON.parse(await entry.async("string"))?.master?.chain;
    return Array.isArray(chain) ? chain.filter(Boolean).map((fx: MixerSlot) => fx!.name) : [];
  } catch {
    return [];
  }
}
