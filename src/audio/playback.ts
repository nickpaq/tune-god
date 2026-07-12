import { getAudioContext } from "./decode";

/**
 * Short gain ramp applied at every start, stop, and natural end of playback.
 * Starting or cutting audio at a non-zero sample value produces an audible
 * click/pop; an ~8 ms fade is inaudible as an envelope but removes the
 * discontinuity entirely. (More robust than snapping to zero crossings,
 * which shifts timing and still clicks on DC-offset or stereo material —
 * the two channels never cross zero at the same instant.)
 */
const FADE_SEC = 0.008;
/** Gain smoothing time constant for live-adjustable controls (balance, tone volume). */
const SMOOTH_SEC = 0.02;

interface ActiveSlot {
  key: string;
  manual: boolean;
  /** Fades the slot's audio to silence and tears it down; does not fire onStopped. */
  fadeAndStop: () => void;
  onStopped: () => void;
}

// Only one preview (sample toggle, drone+sample pair, or standalone tone)
// plays at a time app-wide; starting any of them stops whatever was active.
let active: ActiveSlot | null = null;

function stopActive(): void {
  if (!active) return;
  const a = active;
  a.manual = true;
  active = null;
  a.fadeAndStop();
  a.onStopped();
}

function bufferFromChannelData(channelData: Float32Array[], sampleRate: number): AudioBuffer {
  const ctx = getAudioContext();
  const buffer = ctx.createBuffer(channelData.length, channelData[0].length, sampleRate);
  channelData.forEach((data, ch) => buffer.copyToChannel(new Float32Array(data), ch));
  return buffer;
}

function bufferChannels(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  return channels;
}

/** How far forward (in seconds) to search for a zero crossing before giving up on a clean cut. */
const RELEASE_ZERO_CROSSING_SEARCH_SEC = 0.05;

/** First sample index at or after `target` where the summed-channel signal crosses zero, or null if none found within `maxSearchSamples`. */
function nextZeroCrossingForward(
  channels: Float32Array[],
  length: number,
  target: number,
  maxSearchSamples: number,
): number | null {
  const sumAt = (i: number): number => {
    let sum = 0;
    for (const c of channels) sum += c[i];
    return sum;
  };
  const start = Math.max(0, Math.min(target, length - 2));
  const end = Math.min(length - 2, start + maxSearchSamples);
  let prev = sumAt(start);
  for (let i = start + 1; i <= end; i++) {
    const cur = sumAt(i);
    if ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) return i;
    prev = cur;
  }
  return null;
}

/**
 * Stops a one-shot source at the next zero crossing at or after wherever it
 * actually is in the buffer right now — a genuinely silent cut, no fade
 * needed, since the waveform itself is at zero there. `playbackRate` folds
 * in any live detune (the `detune` AudioParam resamples playback, so real
 * elapsed time doesn't map 1:1 to buffer position once it's non-zero).
 * Falls back to the standard short declick fade if no crossing turns up
 * within the search window (e.g. DC-heavy material, or already near the
 * buffer's end).
 */
function stopAtZeroCrossing(
  buffer: AudioBuffer,
  source: AudioBufferSourceNode,
  fade: GainNode,
  startedAt: number,
  playbackRate: number,
): void {
  const ctx = getAudioContext();
  const rate = playbackRate > 0 ? playbackRate : 1;
  const elapsed = Math.max(0, ctx.currentTime - startedAt);
  const posSamples = Math.floor(elapsed * buffer.sampleRate * rate);
  if (posSamples >= buffer.length - 1) return; // already played out naturally

  const channels = bufferChannels(buffer);
  const maxSearchSamples = Math.round(buffer.sampleRate * RELEASE_ZERO_CROSSING_SEARCH_SEC);
  const crossingIdx = nextZeroCrossingForward(channels, buffer.length, posSamples, maxSearchSamples);
  if (crossingIdx === null) {
    fadeOutAndStop(fade, [source]);
    return;
  }
  const stopAt = ctx.currentTime + (crossingIdx - posSamples) / (buffer.sampleRate * rate);
  try {
    source.stop(stopAt);
  } catch {
    // already stopped
  }
}

function fadeOutAndStop(gain: GainNode, stoppables: Array<{ stop: (when?: number) => void }>): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + FADE_SEC);
  const stopAt = now + FADE_SEC + 0.002;
  for (const s of stoppables) {
    try {
      s.stop(stopAt);
    } catch {
      // already stopped
    }
  }
}

/**
 * Handle for a press-triggered preview. `release` always exists; the
 * `set*` methods only exist on the drone-paired variant (see
 * `pressSampleWithDrone`) and are no-ops to call on the plain one.
 */
export interface PressHandle {
  /** Stops the sample at the next zero crossing (or a short fade as a fallback), and stops the drone if any. */
  release: () => void;
  setBalance?: (balance: number) => void;
  setDetuneCents?: (cents: number) => void;
  setBuffer?: (channelData: Float32Array[], detuneCents?: number) => void;
  setDroneFrequency?: (frequency: number) => void;
}

export type PressDualHandle = Required<PressHandle>;

/**
 * Press-to-play preview: `key` identifies the sound (e.g. a sample id).
 * Every call starts fresh from the beginning — including retriggering the
 * same key while it's already sounding — since the underlying buffer may be
 * re-rendered at any time, so resuming a saved position would land
 * somewhere unrelated in new audio. Plays through to its natural end unless
 * `release()` is called first, which cuts it at the next zero crossing
 * instead of an arbitrary point. `onStopped` fires only if this playback
 * gets superseded by another preview starting elsewhere — not on a normal
 * `release()`, which the caller already knows about.
 */
export function pressSample(
  key: string,
  channelData: Float32Array[],
  sampleRate: number,
  onStopped: () => void,
): PressHandle {
  stopActive();

  const ctx = getAudioContext();
  const buffer = bufferFromChannelData(channelData, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE_SEC);
  const dur = buffer.duration;
  if (dur > FADE_SEC * 4) {
    gain.gain.setValueAtTime(1, now + dur - FADE_SEC);
    gain.gain.linearRampToValueAtTime(0, now + dur);
  }

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);

  const slot: ActiveSlot = {
    key,
    manual: false,
    fadeAndStop: () => fadeOutAndStop(gain, [source]),
    onStopped,
  };
  source.onended = () => {
    if (active === slot) active = null;
    source.disconnect();
    gain.disconnect();
  };
  active = slot;

  const release = () => {
    if (active === slot) active = null;
    stopAtZeroCrossing(buffer, source, gain, now, 1);
  };

  return { release };
}

export interface ToneHandle {
  stop: () => void;
  setVolume: (volume: number) => void;
}

export function playTone(frequency: number, volume: number): ToneHandle {
  stopActive();

  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + FADE_SEC);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);

  const slot: ActiveSlot = {
    key: `tone:${frequency}`,
    manual: false,
    fadeAndStop: () => {
      fadeOutAndStop(gain, [osc]);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    },
    onStopped: () => {},
  };
  active = slot;

  return {
    stop: () => stopActive(),
    // Smoothed to avoid zipper noise while dragging the volume slider.
    setVolume: (v: number) => {
      gain.gain.setTargetAtTime(v, ctx.currentTime, SMOOTH_SEC);
    },
  };
}

export interface MasterLoopOptions {
  /** 0 = drone only, 1 = master only. */
  balance: number;
}

export interface MasterSessionHandle {
  /** Fades out and tears down the loop and any currently-sounding drone note. */
  stop: () => void;
  /** 0 = drone only, 1 = master only. Live-adjustable, no re-render needed. */
  setBalance: (balance: number) => void;
  /** Starts a manually-triggered drone note, or retunes it live if one is already sounding. */
  startDrone: (frequency: number) => void;
  /** Fades out the currently-sounding drone note (e.g. keyboard pad released) without touching the loop. */
  stopDrone: () => void;
}

/**
 * Loops the master sample by itself — always from the beginning, no
 * auto-triggered drone — while exposing `startDrone`/`stopDrone` so a
 * manually-played keyboard note (see MasterGrid) can sound alongside it.
 * The loop uses the same declicked-retrigger technique as
 * `playSampleWithDrone` rather than `AudioBufferSourceNode.loop`, since the
 * buffer's start/end aren't guaranteed to align and would click at the seam.
 * `key` participates in the app-wide single-preview slot, so starting this
 * stops any other preview and vice versa; the drone note it manages is not
 * itself a separate slot; it lives and dies with this session.
 */
export function playMasterLoop(
  key: string,
  channelData: Float32Array[],
  sampleRate: number,
  options: MasterLoopOptions,
  onStopped: () => void,
): MasterSessionHandle {
  stopActive();

  const ctx = getAudioContext();
  const buffer = bufferFromChannelData(channelData, sampleRate);

  const sampleBus = ctx.createGain();
  sampleBus.connect(ctx.destination);
  const droneBus = ctx.createGain();
  droneBus.connect(ctx.destination);

  const setBalance = (balance: number) => {
    const s = Math.max(0, Math.min(1, balance));
    const now = ctx.currentTime;
    // The drone is a pure sine at full amplitude, which reads much louder
    // than a real sample at the same gain value — scaled down so 50/50
    // balance sounds roughly equal-loudness rather than drone-dominant.
    sampleBus.gain.setTargetAtTime(s, now, SMOOTH_SEC);
    droneBus.gain.setTargetAtTime((1 - s) * 0.55, now, SMOOTH_SEC);
  };
  setBalance(options.balance);

  let live = true;
  let currentSource: AudioBufferSourceNode | null = null;

  const scheduleOne = () => {
    if (!live) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const fade = ctx.createGain();
    source.connect(fade);
    fade.connect(sampleBus);

    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE_SEC);
    const dur = buffer.duration;
    if (dur > FADE_SEC * 4) {
      fade.gain.setValueAtTime(1, now + dur - FADE_SEC);
      fade.gain.linearRampToValueAtTime(0, now + dur);
    }
    source.start(now);
    currentSource = source;
    source.onended = () => {
      if (!live || currentSource !== source) return;
      scheduleOne();
    };
  };
  scheduleOne();

  let droneOsc: OscillatorNode | null = null;
  let droneGain: GainNode | null = null;

  const startDrone = (frequency: number) => {
    if (droneOsc && droneGain) {
      droneOsc.frequency.setTargetAtTime(frequency, ctx.currentTime, SMOOTH_SEC);
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(droneBus);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE_SEC);
    osc.start(now);
    droneOsc = osc;
    droneGain = gain;
  };

  const stopDrone = () => {
    if (!droneOsc || !droneGain) return;
    const osc = droneOsc;
    const gain = droneGain;
    droneOsc = null;
    droneGain = null;
    fadeOutAndStop(gain, [osc]);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  };

  const fadeAndStop = () => {
    if (currentSource) fadeOutAndStop(sampleBus, [currentSource]);
    if (droneOsc) fadeOutAndStop(droneBus, [droneOsc]);
    const cleanupAt = (FADE_SEC + 0.02) * 1000;
    setTimeout(() => {
      sampleBus.disconnect();
      droneBus.disconnect();
    }, cleanupAt);
  };

  const stop = () => {
    if (!live) return;
    live = false;
    if (active === slot) active = null;
    fadeAndStop();
  };

  const slot: ActiveSlot = {
    key,
    manual: false,
    fadeAndStop: () => {
      live = false;
      fadeAndStop();
    },
    onStopped,
  };
  active = slot;

  return { stop, setBalance, startDrone, stopDrone };
}

export interface PressDualOptions {
  droneFrequency: number;
  /** 0 = drone only, 1 = sample only. */
  balance: number;
  /** Live pitch preview offset in cents, applied via the native AudioParam — no DSP. */
  detuneCents?: number;
  /**
   * Preview-only octave shift applied to *both* the sample and the drone
   * together (e.g. 3 for "bass" mode) — lets a low-fundamental sample be
   * heard/tuned by ear more easily. Never affects the actual exported audio.
   */
  previewOctaveShift?: number;
}

/**
 * Plays a sample once, together with a continuous reference drone, so
 * mistunes surface as audible beating against the drone rather than needing
 * a separate visual/numeric check. Press-triggered: starts the sample from
 * the beginning (retriggering immediately if it's already sounding) and
 * starts the drone alongside it; the drone keeps sustaining for as long as
 * the button is held even after the sample itself finishes, and both stop
 * together on `release()` — the sample cut at the next zero crossing, the
 * drone with its usual short fade. `key` participates in the app-wide
 * single-preview slot, so starting this stops any other preview and vice
 * versa.
 */
export function pressSampleWithDrone(
  key: string,
  channelData: Float32Array[],
  sampleRate: number,
  options: PressDualOptions,
  onStopped: () => void,
): PressDualHandle {
  stopActive();

  const ctx = getAudioContext();
  const octaveShiftCents = (options.previewOctaveShift ?? 0) * 1200;
  let buffer = bufferFromChannelData(channelData, sampleRate);
  let detuneCents = options.detuneCents ?? 0;

  const sampleBus = ctx.createGain();
  sampleBus.connect(ctx.destination);
  const droneBus = ctx.createGain();
  droneBus.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = options.droneFrequency * Math.pow(2, options.previewOctaveShift ?? 0);
  osc.connect(droneBus);
  osc.start();

  const setBalance = (balance: number) => {
    const s = Math.max(0, Math.min(1, balance));
    const now = ctx.currentTime;
    // The drone is a pure sine at full amplitude, which reads much louder
    // than a real sample at the same gain value — scaled down so 50/50
    // balance sounds roughly equal-loudness rather than drone-dominant.
    sampleBus.gain.setTargetAtTime(s, now, SMOOTH_SEC);
    droneBus.gain.setTargetAtTime((1 - s) * 0.55, now, SMOOTH_SEC);
  };
  setBalance(options.balance);

  let currentSource: AudioBufferSourceNode | null = null;
  let currentFade: GainNode | null = null;
  let startedAt = 0;

  const playOnce = () => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.detune.value = detuneCents + octaveShiftCents;
    const fade = ctx.createGain();
    source.connect(fade);
    fade.connect(sampleBus);

    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE_SEC);
    const dur = buffer.duration;
    if (dur > FADE_SEC * 4) {
      fade.gain.setValueAtTime(1, now + dur - FADE_SEC);
      fade.gain.linearRampToValueAtTime(0, now + dur);
    }
    source.start(now);
    currentSource = source;
    currentFade = fade;
    startedAt = now;
    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
        currentFade = null;
      }
      source.disconnect();
      fade.disconnect();
    };
  };
  playOnce();

  const setDetuneCents = (cents: number) => {
    detuneCents = cents;
    currentSource?.detune.setTargetAtTime(cents + octaveShiftCents, ctx.currentTime, SMOOTH_SEC);
  };

  const setDroneFrequency = (frequency: number) => {
    osc.frequency.setTargetAtTime(frequency * Math.pow(2, options.previewOctaveShift ?? 0), ctx.currentTime, SMOOTH_SEC);
  };

  const setBuffer = (nextChannelData: Float32Array[], nextDetuneCents = 0) => {
    buffer = bufferFromChannelData(nextChannelData, sampleRate);
    detuneCents = nextDetuneCents;
    // Takes effect on the *next* press — the sample already sounding
    // finishes on the buffer it started with.
  };

  const release = () => {
    if (active === slot) active = null;
    if (currentSource && currentFade) {
      const rate = Math.pow(2, (detuneCents + octaveShiftCents) / 1200);
      stopAtZeroCrossing(buffer, currentSource, currentFade, startedAt, rate);
    }
    fadeOutAndStop(droneBus, [osc]);
    osc.onended = () => {
      osc.disconnect();
      droneBus.disconnect();
      sampleBus.disconnect();
    };
  };

  const slot: ActiveSlot = {
    key,
    manual: false,
    fadeAndStop: () => {
      if (currentSource) fadeOutAndStop(sampleBus, [currentSource]);
      fadeOutAndStop(droneBus, [osc]);
    },
    onStopped,
  };
  active = slot;

  return { release, setBalance, setDetuneCents, setBuffer, setDroneFrequency };
}
