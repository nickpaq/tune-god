// Minimal Web Audio playback for the pad grid: held, looping, monophonic pad playback with a
// pitch shift and optional reference tone (a sine on the key, or for a melodic loop a soft saw chord on it), and a held sine tone for the key picker.
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

/**
 * The reference tone. For a single sound it is a sine on the key's note. For a melodic loop it is a soft saw-wave chord on the key (its root, a third and
 * a fifth: a minor chord, or a major one), so the loop can be judged against a whole key and not one note. Two slightly detuned saws per note give the
 * chord some width, and a low-pass keeps it soft. `out` carries the chord at roughly 1.3 times the amplitude of one saw; set the level on a gain after it.
 */
export type ReferenceTone = "sine" | "minor" | "major";
const CHORD_INTERVALS: Record<"minor" | "major", number[]> = { minor: [0, 3, 7], major: [0, 4, 7] };
const CHORD_DETUNE_CENTS = [-6, 6];
const CHORD_CUTOFF_HZ = 1200;
interface ChordTone {
  out: AudioNode;
  start: () => void;
  /** Stops every voice at the context time `when` (now by default). */
  stop: (when?: number) => void;
  /** Called once, when the last voice has stopped. */
  onEnded: (fn: () => void) => void;
}

/** The reference tone on `pitchClass` (0 = C), in the octave from middle C. */
function createTone(ctx: AudioContext, pitchClass: number, kind: ReferenceTone): ChordTone {
  if (kind === "sine") {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToFrequency(60 + pitchClass, a4Reference);
    return { out: osc, start: () => osc.start(), stop: (when) => osc.stop(when), onEnded: (fn) => { osc.onended = fn; } };
  }
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = CHORD_CUTOFF_HZ;
  lowpass.Q.value = 0.5;
  const voices: OscillatorNode[] = [];
  for (const interval of CHORD_INTERVALS[kind]) {
    for (const cents of CHORD_DETUNE_CENTS) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = midiToFrequency(60 + pitchClass + interval, a4Reference);
      osc.detune.value = cents;
      osc.connect(lowpass);
      voices.push(osc);
    }
  }
  return {
    out: lowpass,
    start: () => voices.forEach((o) => o.start()),
    stop: (when) => voices.forEach((o) => o.stop(when)),
    onEnded: (fn) => {
      voices[0].onended = fn;
    },
  };
}

/** Pad gain is held for this long after release before the fade starts. */
const RELEASE_HOLD = 0.03;
/** Length of the fade-out that follows the hold. */
const RELEASE_FADE = 0.15;
/** Quick fade used when a retrigger cuts off the previous hit of the same pad. */
const CUT_FADE = 0.008;
/** The reference tone always fades out over exactly this long after release. */
const TONE_FADE = 0.15;
const MAX_TONE_GAIN = 0.7;
/** The chord fades in over this long, so it never clicks in. */
const CHORD_ATTACK = 0.03;

export interface PadHandle {
  /** Holds briefly, then fades the pad (and tone) out. A "oneshot" pad ignores it and plays to its end. */
  release: () => void;
  /** Stops the pad now with a short fade, whatever its mode. */
  cut: () => void;
  /** Retunes the playing pad immediately, without restarting it. */
  setShift: (semitones: number) => void;
  /** Where the sound is now, in seconds from the start of the audio (the start offset plus the time it has played). */
  position: () => number;
}

interface ActivePad {
  gain: GainNode;
  stop: (hold: number, fade: number) => void;
}

const activePads = new Map<number, ActivePad>();

/** Frames quieter than this (relative to the sample's peak) are silence or tail, not the sound itself. */
const GATE_DB = -40;

/**
 * RMS over all channels of the part of the sample you actually hear; used to level-match the reference tone.
 * Silence and quiet tails are left out, since averaging them in would drag a short hit's level (and the tone) down.
 */
function rms(channelData: Float32Array[]): number {
  let peak = 0;
  for (const data of channelData) for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const gate = peak * 10 ** (GATE_DB / 20);
  let sum = 0;
  let count = 0;
  for (const data of channelData) {
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) < gate) continue;
      sum += data[i] * data[i];
      count++;
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

/** How a pad previews: "loop" repeats while held (melodic sounds); "hold" plays once and is cut on release; "oneshot" plays all the way through whatever the finger does. */
export type PadMode = "loop" | "hold" | "oneshot";

/**
 * Starts a pad for as long as it is held, cutting off any earlier hit of the same pad (monophonic).
 * Preview only: nothing here touches the project's own play settings. The shift is applied as a
 * playback-rate change (a resample), exactly how the tuned sample would sound once baked in.
 * With a tone pitch class, the reference tone plays at the sample's RMS level on its own gain, so it always
 * decays at the fixed TONE_FADE rate however long or short the sample is. Release holds briefly,
 * then fades both voices out smoothly.
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
  /** The pad knob's level in dB (0 or below): the sound itself already holds its loudness gain, the mix sits on the knob. */
  levelDb = 0,
  /** Seconds into the audio to start from. */
  startSeconds = 0,
  /** What the reference tone is: a sine on the key's note (the default), or for a melodic loop a soft saw minor or major chord on the key. */
  toneKind: ReferenceTone = "sine",
): PadHandle {
  const ctx = readyContext();
  activePads.get(pad)?.stop(0, CUT_FADE);

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = bufferFor(ctx, channelData, sampleRate);
  source.loop = mode === "loop";
  source.playbackRate.value = semitonesToRatio(shiftSemitones);
  const level = 10 ** (levelDb / 20);
  if (level === 1) source.connect(gain);
  else {
    const knob = ctx.createGain();
    knob.gain.value = level;
    source.connect(knob).connect(gain);
  }

  let osc: ChordTone | null = null;
  let toneGain: GainNode | null = null;
  if (tonePitchClass !== null) {
    osc = createTone(ctx, tonePitchClass, toneKind);
    toneGain = ctx.createGain();
    if (toneKind === "sine") {
      // A sine of amplitude a has RMS a / sqrt(2), so this matches the sample's RMS.
      toneGain.gain.value = Math.min(MAX_TONE_GAIN, rms(channelData) * Math.SQRT2 * level);
    } else {
      // The chord is six saws through a low-pass: about 1.3 times the RMS of one saw (0.58 of its amplitude), so this brings it to the sample's RMS.
      const target = Math.min(MAX_TONE_GAIN, rms(channelData) * level);
      toneGain.gain.setValueAtTime(0, ctx.currentTime);
      toneGain.gain.linearRampToValueAtTime(target / 0.75, ctx.currentTime + CHORD_ATTACK);
    }
    osc.out.connect(toneGain).connect(gain);
    osc.start();
  }
  const startedAt = ctx.currentTime;
  source.start(0, startSeconds);

  let stopped = false;
  const finish = () => {
    gain.disconnect();
    osc?.stop();
    if (activePads.get(pad) === voice) activePads.delete(pad);
  };
  source.onended = () => {
    // A sample ending on its own leaves only the tone (if any), which keeps sounding until release.
    if (!osc) finish();
    onEnd?.();
  };

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
      if (toneGain) {
        // The tone's decay is its own and fixed, so it is identical on every pad.
        toneGain.gain.cancelScheduledValues(t);
        toneGain.gain.setValueAtTime(toneGain.gain.value, t);
        toneGain.gain.setValueAtTime(toneGain.gain.value, t + hold);
        toneGain.gain.linearRampToValueAtTime(0, t + hold + TONE_FADE);
      }
      const end = t + hold + Math.max(fade, TONE_FADE) + 0.02;
      try { source.stop(end); } catch { /* already ended */ }
      osc?.stop(end);
      if (osc) {
        source.onended = null;
        osc.onEnded(finish);
      } else source.onended = finish;
    },
  };
  activePads.set(pad, voice);
  return {
    release: () => {
      if (mode !== "oneshot") voice.stop(RELEASE_HOLD, RELEASE_FADE);
    },
    cut: () => voice.stop(0, CUT_FADE),
    position: () => startSeconds + (ctx.currentTime - startedAt) * source.playbackRate.value,
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
    gain.gain.linearRampToValueAtTime(0, t + 0.08);
    osc.stop(t + 0.1);
  };
}

/** Builds the audio buffer for a sound ahead of time, so the first press of play does not wait for it. */
export function prepareBuffer(channelData: Float32Array[], sampleRate: number): void {
  bufferFor(getAudioContext(), channelData, sampleRate);
}
