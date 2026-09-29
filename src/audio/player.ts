// Minimal Web Audio playback for the pad grid: one-shot pad playback with a
// pitch shift, and a held sine tone for the key picker.
import { getAudioContext } from "./decode";
import { midiToFrequency, semitonesToRatio } from "./theory";

const bufferCache = new WeakMap<Float32Array[], AudioBuffer>();
const activePads = new Map<number, AudioBufferSourceNode>();

function bufferFor(ctx: AudioContext, channelData: Float32Array[], sampleRate: number): AudioBuffer {
  let buffer = bufferCache.get(channelData);
  if (!buffer) {
    buffer = ctx.createBuffer(channelData.length, channelData[0].length, sampleRate);
    channelData.forEach((data, ch) => buffer!.copyToChannel(data as Float32Array<ArrayBuffer>, ch));
    bufferCache.set(channelData, buffer);
  }
  return buffer;
}

function readyContext(): AudioContext {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Plays a pad from the start, cutting off any earlier hit of the same pad.
 * The shift is applied as a playback-rate change (a resample), which is
 * exactly how the tuned one-shot would sound once baked into the project.
 */
export function playPad(pad: number, channelData: Float32Array[], sampleRate: number, shiftSemitones: number): void {
  const ctx = readyContext();
  activePads.get(pad)?.stop();
  const source = ctx.createBufferSource();
  source.buffer = bufferFor(ctx, channelData, sampleRate);
  source.playbackRate.value = semitonesToRatio(shiftSemitones);
  source.connect(ctx.destination);
  source.onended = () => {
    if (activePads.get(pad) === source) activePads.delete(pad);
  };
  activePads.set(pad, source);
  source.start();
}

/** Cuts off every pad that is currently playing. */
export function stopAll(): void {
  for (const source of activePads.values()) source.stop();
  activePads.clear();
}

/** Starts a sine tone on `pitchClass` (0 = C) in the octave from middle C; returns a function that releases it. */
export function startSine(pitchClass: number): () => void {
  const ctx = readyContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = midiToFrequency(60 + pitchClass);
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  return () => {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.06);
    osc.stop(t + 0.08);
  };
}
