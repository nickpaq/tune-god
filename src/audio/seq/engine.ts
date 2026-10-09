import { connectPadFilters, createMasterClipper, DEFAULT_PAD_FILTERS, type PadFilters } from "./effects";
import { getAudioContext } from "../decode";
import { eventsBetween, TICKS_PER_BEAT, type SeqSession } from "./model";
export interface SeqSound { channelData: Float32Array[]; sampleRate: number; pitch: number; volume: number; filters?: PadFilters; }
const cache = new Map<Float32Array[], AudioBuffer>();
let cachedBytes = 0;
let cacheLimit = 128 * 1024 * 1024;
export function setSeqBufferLimit(bytes: number): void {
  cacheLimit = Math.max(8 * 1024 * 1024, Math.min(256 * 1024 * 1024, bytes));
  clearSeqBuffers();
}
export function clearSeqBuffers(): void { cache.clear(); cachedBytes = 0; }
export function prepareSeqSound(sound: SeqSound): AudioBuffer {
  const prior = cache.get(sound.channelData);
  if (prior) { cache.delete(sound.channelData); cache.set(sound.channelData, prior); return prior; }
  const ctx = getAudioContext();
  const bytes = sound.channelData.length * sound.channelData[0].length * 4;
  const buffer = ctx.createBuffer(sound.channelData.length, sound.channelData[0].length, sound.sampleRate);
  sound.channelData.forEach((data, c) => buffer.getChannelData(c).set(data));
  if (bytes <= cacheLimit) {
    while (cachedBytes + bytes > cacheLimit && cache.size) {
      const first = cache.keys().next().value!;
      const old = cache.get(first)!; cachedBytes -= old.numberOfChannels * old.length * 4; cache.delete(first);
    }
    cache.set(sound.channelData, buffer); cachedBytes += bytes;
  }
  return buffer;
}
export async function prepareSeqSounds(sounds: SeqSound[], maxBytes = cacheLimit, cancelled = () => false): Promise<number> {
  let used = 0;
  for (const sound of sounds) {
    if (cancelled()) break;
    const bytes = sound.channelData.length * sound.channelData[0].length * 4;
    if (used + bytes > maxBytes) continue;
    prepareSeqSound(sound); used += bytes;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return used;
}
export function seqBufferUsage(): number { return cachedBytes; }
export function playSeqSound(sound: SeqSound, pitch: number, velocity: number, when?: number, lengthSeconds?: number, destination?: AudioNode, attackSeconds = 0) {
  const ctx = getAudioContext(); void ctx.resume();
  const buffer = prepareSeqSound(sound);
  const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = buffer;
  source.playbackRate.value = 2 ** ((sound.pitch + pitch) / 12);
  const startAt = Math.max(ctx.currentTime, when ?? ctx.currentTime);
  const level = sound.volume * velocity / 127;
  gain.gain.setValueAtTime(attackSeconds > 0 ? 0 : level, startAt);
  if (attackSeconds > 0) gain.gain.linearRampToValueAtTime(level, startAt + attackSeconds);
  source.connect(gain);
  const filters = connectPadFilters(ctx, gain, destination ?? ctx.destination, sound.filters ?? DEFAULT_PAD_FILTERS);
  source.start(startAt);
  let ended = false;
  source.onended = () => { ended = true; source.disconnect(); gain.disconnect(); filters.disconnect(); };
  const releaseAt = (at: number, seconds: number) => {
    if (ended) return;
    gain.gain.cancelAndHoldAtTime(at);
    gain.gain.linearRampToValueAtTime(0, at + Math.max(0, seconds));
    source.stop(at + Math.max(0, seconds));
  };
  const release = (seconds = 0.025) => releaseAt(ctx.currentTime, seconds);
  if (lengthSeconds !== undefined) releaseAt(startAt + lengthSeconds, 0.025);
  const glide = (pitch: number, seconds: number) => {
    if (ended) return;
    const now = ctx.currentTime;
    const rate = source.playbackRate;
    rate.cancelAndHoldAtTime(now);
    const target = 2 ** ((sound.pitch + pitch) / 12);
    // Exponential playback-rate ramps make pitch move evenly in semitones.
    if (seconds > 0) rate.exponentialRampToValueAtTime(target, now + seconds);
    else rate.setValueAtTime(target, now);
  };
  return { release, glide, isEnded: () => ended, cut: (at = ctx.currentTime) => { if (!ended) source.stop(at); } };
}
export function startSequencer(read: () => { session: SeqSession; bpm: number; beatsPerBar: number }, sound: (pad: number) => SeqSound | null) {
  const ctx = getAudioContext(); void ctx.resume();
  const start = ctx.currentTime + 0.04;
  const initial = read(); const bpm = initial.bpm;
  let through = 0;
  const master = createMasterClipper(ctx, ctx.destination);
  const gains = Array.from({ length: 4 }, () => { const gain = ctx.createGain(); gain.connect(master.input); return gain; });
  const voices = new Set<ReturnType<typeof playSeqSound>>();
  const schedule = () => {
    const state = read();
    gains.forEach((gain, b) => gain.gain.setTargetAtTime(state.session.muted[b] ? 0 : state.session.gains[b], ctx.currentTime, 0.01));
    const next = Math.max(0, (ctx.currentTime + 0.12 - start) * bpm / 60 * TICKS_PER_BEAT);
    for (const note of eventsBetween(state.session, state.beatsPerBar, through, next)) {
      const data = sound(note.pad); if (!data) continue;
      const voice = playSeqSound(data, note.pitch, note.velocity, start + note.absoluteTick / TICKS_PER_BEAT * 60 / bpm, note.gate ? note.length / TICKS_PER_BEAT * 60 / bpm : undefined, gains[note.bank]);
      voices.add(voice);
      // Bound the handle set, and let ended Web Audio nodes disconnect themselves.
      if (voices.size > 256) { const oldest = voices.values().next().value!; oldest.cut(); voices.delete(oldest); }
    }
    through = next;
  };
  schedule(); const timer = window.setInterval(schedule, 25);
  return { masterInput: master.input, setMasterClipper: master.update, tick: () => Math.max(0, (ctx.currentTime - start) * bpm / 60 * TICKS_PER_BEAT),
    stop: () => { window.clearInterval(timer); for (const voice of voices) voice.cut(); gains.forEach(g => g.disconnect()); master.disconnect(); } };
}
