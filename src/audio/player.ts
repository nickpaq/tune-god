// Minimal Web Audio playback for the pad grid: held, looping, monophonic pad playback with a
// pitch shift and optional reference tone, and a held sine tone for the key picker.
import { getAudioContext } from "./decode";
import { midiToFrequency, semitonesToRatio } from "./theory";

/** A4 reference (Hz) the reference tones are built on; the app sets it from the menu. */
let a4Reference = 440;
export function setReferencePitch(hz: number): void {
  a4Reference = hz;
}

const bufferCache = new WeakMap<Float32Array[], AudioBuffer>();

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

/** Pad gain is held for this long after release before the fade starts. */
const RELEASE_HOLD = 0.03;
/** Length of the fade-out that follows the hold. */
const RELEASE_FADE = 0.15;
/** Quick fade used when a retrigger cuts off the previous hit of the same pad. */
const CUT_FADE = 0.008;
const MAX_TONE_GAIN = 0.5;

export interface PadHandle {
  /** Holds briefly, then fades the pad (and tone) out. */
  release: () => void;
  /** Retunes the playing pad immediately, without restarting it. */
  setShift: (semitones: number) => void;
}

interface ActivePad {
  gain: GainNode;
  stop: (hold: number, fade: number) => void;
}

const activePads = new Map<number, ActivePad>();

/** RMS over all channels; used to level-match the reference tone to the sample. */
function rms(channelData: Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const data of channelData) {
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    count += data.length;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

/** How a pad sounds when tapped; see `startPad`. */
export type PadMode = "loop" | "hold" | "oneShot";

/**
 * Starts a pad looping for as long as it is held, cutting off any earlier hit of the same pad
 * (monophonic). With `withTone`, a sine on `tonePitchClass` plays at the sample's RMS level.
 * The shift is applied as a playback-rate change (a resample), which is exactly how the tuned
 * sample would sound once baked into the project. Returns a release function that holds
 * briefly, then fades both voices out. How it plays depends on `mode`: "loop" repeats
 * while held; "hold" plays once from the start and is cut on release; "oneShot" plays the whole
 * sample once, ignoring release (only a retrigger of the same pad cuts it). Only "loop" sounds the tone.
 */

export function startPad(
  pad: number,
  channelData: Float32Array[],
  sampleRate: number,
  shiftSemitones: number,
  tonePitchClass: number | null,
  mode: PadMode = "loop",
  /** Called when a non-looping sound plays to its end on its own (not when it is released or cut off). */
  onEnd?: () => void,
): PadHandle {
  const oneShot = mode === "oneShot";
  const ctx = readyContext();
  activePads.get(pad)?.stop(0, CUT_FADE);

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = bufferFor(ctx, channelData, sampleRate);
  source.loop = mode === "loop";
  source.playbackRate.value = semitonesToRatio(shiftSemitones);
  source.connect(gain);

  let osc: OscillatorNode | null = null;
  if (tonePitchClass !== null && mode === "loop") {
    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToFrequency(60 + tonePitchClass, a4Reference);
    const toneGain = ctx.createGain();
    // A sine of amplitude a has RMS a / sqrt(2), so this matches the sample's RMS.
    toneGain.gain.value = Math.min(MAX_TONE_GAIN, rms(channelData) * Math.SQRT2);
    osc.connect(toneGain).connect(gain);
    osc.start();
  }
  source.start();
  if (mode !== "loop") {
    source.onended = () => {
      gain.disconnect();
      if (activePads.get(pad) === voice) activePads.delete(pad);
      onEnd?.();
    };
  }

  let stopped = false;
  const voice: ActivePad = {
    gain,
    stop: (hold, fade) => {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.setValueAtTime(gain.gain.value, t + hold);
      gain.gain.linearRampToValueAtTime(0, t + hold + fade);
      source.stop(t + hold + fade + 0.02);
      osc?.stop(t + hold + fade + 0.02);
      source.onended = () => {
        gain.disconnect();
        if (activePads.get(pad) === voice) activePads.delete(pad);
      };
    },
  };
  activePads.set(pad, voice);
  return {
    release: () => {
      if (!oneShot) voice.stop(RELEASE_HOLD, RELEASE_FADE);
    },
    setShift: (semitones) =>
      source.playbackRate.setTargetAtTime(semitonesToRatio(semitones), ctx.currentTime, 0.005),
  };
}

/** Starts a sine tone on `pitchClass` (0 = C) in the octave from middle C; returns a function that releases it. */
export function startSine(pitchClass: number): () => void {
  const ctx = readyContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = midiToFrequency(60 + pitchClass, a4Reference);
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
