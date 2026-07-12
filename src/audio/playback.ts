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

interface LoopWindow {
  /** Offset into the buffer, in seconds, where each retrigger cycle starts. */
  startSec: number;
  /** Length of the looped segment, in seconds. */
  durationSec: number;
}

/** How far (in seconds) to search outward from a target index for a zero crossing. */
const ZERO_CROSSING_SEARCH_SEC = 0.05;
/** Never loop a segment shorter than this, even on a very short buffer. */
const MIN_LOOP_SEC = 0.05;

/**
 * Picks a short, mid-sample loop window instead of the whole buffer: from a
 * zero crossing near the midpoint to a zero crossing near the 3/4 mark.
 * Skipping straight to the sustain (past the attack transient) and looping
 * a short segment makes preview retriggers land every fraction of a second
 * instead of every full playthrough, so a freshly-rendered buffer (or a
 * live detune change) is audible almost immediately instead of after
 * waiting out the entire original sample — and starting/ending on zero
 * crossings keeps the short loop from buzzing at the seam. 3/4 rather than
 * the tail end keeps the window inside the sample's sustain, before it's
 * decayed to near-silence.
 */
function computeLoopWindow(buffer: AudioBuffer): LoopWindow {
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  if (length < 2) return { startSec: 0, durationSec: buffer.duration };

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  const sumAt = (i: number): number => {
    let sum = 0;
    for (const c of channels) sum += c[i];
    return sum;
  };

  const searchRadius = Math.max(1, Math.min(Math.round(sampleRate * ZERO_CROSSING_SEARCH_SEC), Math.floor(length / 8)));

  const nearestZeroCrossing = (target: number): number => {
    const lo = Math.max(0, target - searchRadius);
    const hi = Math.min(length - 2, target + searchRadius);
    let best = target;
    let bestDist = Infinity;
    for (let i = lo; i <= hi; i++) {
      const cur = sumAt(i);
      const next = sumAt(i + 1);
      if ((cur <= 0 && next > 0) || (cur >= 0 && next < 0)) {
        const dist = Math.abs(i - target);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
    }
    return best;
  };

  const startIdx = nearestZeroCrossing(Math.floor(length / 2));
  const minLoopSamples = Math.round(sampleRate * MIN_LOOP_SEC);
  const endIdx = Math.min(
    Math.max(nearestZeroCrossing(Math.floor(length * 0.75)), startIdx + minLoopSamples),
    length - 1,
  );

  return {
    startSec: startIdx / sampleRate,
    durationSec: Math.max((endIdx - startIdx) / sampleRate, minLoopSamples / sampleRate),
  };
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
 * Tap-to-play / tap-to-stop preview. `key` identifies the sound (e.g. a
 * sample id); tapping the same key stops it, tapping a different key stops
 * the current one and starts the new one. Playback always starts from the
 * beginning — the underlying buffer may be re-rendered at any time, so
 * resuming a saved position would land somewhere unrelated in new audio.
 * Returns true if the sound is now playing. `onStopped` fires whenever this
 * playback ends for any reason (stopped, replaced by another preview, or
 * natural end) so the caller can reset its button state.
 */
export function togglePlayback(
  key: string,
  channelData: Float32Array[],
  sampleRate: number,
  onStopped: () => void,
): boolean {
  if (active?.key === key) {
    stopActive();
    return false;
  }
  stopActive();

  const ctx = getAudioContext();
  const buffer = bufferFromChannelData(channelData, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE_SEC);
  const end = now + buffer.duration;
  if (buffer.duration > FADE_SEC * 4) {
    gain.gain.setValueAtTime(1, end - FADE_SEC);
    gain.gain.linearRampToValueAtTime(0, end);
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
    if (slot.manual) return;
    if (active === slot) active = null;
    onStopped();
  };
  active = slot;
  return true;
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

export interface DualPlaybackOptions {
  droneFrequency: number;
  /** 0 = drone only, 1 = sample only. */
  balance: number;
  /** Live pitch preview offset in cents, applied via the native AudioParam — no DSP. */
  detuneCents?: number;
}

export interface DualHandle {
  stop: () => void;
  /** 0 = drone only, 1 = sample only. Live-adjustable, no re-render needed. */
  setBalance: (balance: number) => void;
  /**
   * Retunes the currently playing source in real time via the native
   * `detune` AudioParam — instant, no worker round-trip. This is the cheap
   * preview path for auditioning a trim while dragging; the expensive
   * high-quality resample/Rubber Band render only needs to happen once,
   * when the value settles (see `setBuffer`).
   */
  setDetuneCents: (cents: number) => void;
  /**
   * Swaps in freshly-rendered (DSP-quality) audio, e.g. once a background
   * render lands. Takes effect at the next loop retrigger rather than
   * cutting the currently playing cycle short, so the handoff never clicks
   * or restarts mid-note.
   */
  setBuffer: (channelData: Float32Array[], detuneCents?: number) => void;
  /** Retunes the drone oscillator live via its own AudioParam — no restart of the sample/loop underneath. */
  setDroneFrequency: (frequency: number) => void;
}

/**
 * Plays a sample and a reference drone together, so mistunes surface as
 * audible beating against the drone rather than needing a separate
 * visual/numeric check. Rather than looping the whole sample, it loops a
 * short mid-sample window (see `computeLoopWindow`) via declicked retrigger
 * (not `AudioBufferSourceNode.loop` — that would click at the seam since
 * the window's start/end aren't guaranteed to align); the drone sustains
 * continuously underneath. The short window means retriggers land every
 * fraction of a second instead of every full playthrough, so a live detune
 * change or a freshly-landed background render (see `setBuffer`) is audible
 * almost immediately rather than after waiting out the whole original
 * sample. `key` participates in the app-wide single-preview slot like
 * `togglePlayback`, so starting this stops any other preview and vice versa.
 */
export function playSampleWithDrone(
  key: string,
  channelData: Float32Array[],
  sampleRate: number,
  options: DualPlaybackOptions,
  onStopped: () => void,
): DualHandle {
  stopActive();

  const ctx = getAudioContext();
  let buffer = bufferFromChannelData(channelData, sampleRate);
  let loopWindow = computeLoopWindow(buffer);
  let detuneCents = options.detuneCents ?? 0;

  const sampleBus = ctx.createGain();
  sampleBus.connect(ctx.destination);
  const droneBus = ctx.createGain();
  droneBus.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = options.droneFrequency;
  osc.connect(droneBus);
  osc.start();

  let live = true;
  let currentSource: AudioBufferSourceNode | null = null;

  const scheduleOne = () => {
    if (!live) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.detune.value = detuneCents;
    const fade = ctx.createGain();
    source.connect(fade);
    fade.connect(sampleBus);

    const now = ctx.currentTime;
    const dur = loopWindow.durationSec;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE_SEC);
    if (dur > FADE_SEC * 4) {
      fade.gain.setValueAtTime(1, now + dur - FADE_SEC);
      fade.gain.linearRampToValueAtTime(0, now + dur);
    }
    source.start(now, loopWindow.startSec, dur);
    currentSource = source;
    source.onended = () => {
      if (!live || currentSource !== source) return;
      scheduleOne();
    };
  };
  scheduleOne();

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

  const setDetuneCents = (cents: number) => {
    detuneCents = cents;
    currentSource?.detune.setTargetAtTime(cents, ctx.currentTime, SMOOTH_SEC);
  };

  const setDroneFrequency = (frequency: number) => {
    osc.frequency.setTargetAtTime(frequency, ctx.currentTime, SMOOTH_SEC);
  };

  const setBuffer = (nextChannelData: Float32Array[], nextDetuneCents = 0) => {
    buffer = bufferFromChannelData(nextChannelData, sampleRate);
    loopWindow = computeLoopWindow(buffer);
    detuneCents = nextDetuneCents;
    // Deliberately doesn't touch currentSource — the cycle already in
    // flight finishes on the old buffer, and the next retrigger (scheduled
    // via source.onended above) picks up this new one automatically.
  };

  const stop = () => {
    if (!live) return;
    live = false;
    if (active === slot) active = null;
    fadeAndStop();
  };

  const fadeAndStop = () => {
    if (currentSource) fadeOutAndStop(sampleBus, [currentSource]);
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
      live = false;
      fadeAndStop();
    },
    onStopped,
  };
  active = slot;

  return { stop, setBalance, setDetuneCents, setBuffer, setDroneFrequency };
}
