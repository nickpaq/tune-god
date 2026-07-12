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

interface ActivePlayback {
  key: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  onStopped: () => void;
  /** Set before an intentional stop() so onended doesn't double-fire callbacks. */
  manual: boolean;
}

let active: ActivePlayback | null = null;

function bufferFromChannelData(channelData: Float32Array[], sampleRate: number): AudioBuffer {
  const ctx = getAudioContext();
  const buffer = ctx.createBuffer(channelData.length, channelData[0].length, sampleRate);
  channelData.forEach((data, ch) => buffer.copyToChannel(new Float32Array(data), ch));
  return buffer;
}

function stopActive(): void {
  if (!active) return;
  const a = active;
  a.manual = true;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  a.gain.gain.cancelScheduledValues(now);
  a.gain.gain.setValueAtTime(a.gain.gain.value, now);
  a.gain.gain.linearRampToValueAtTime(0, now + FADE_SEC);
  try {
    a.source.stop(now + FADE_SEC + 0.002);
  } catch {
    // already stopped
  }
  active = null;
  a.onStopped();
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
  // Declick the natural end too — a buffer that ends off zero would
  // otherwise pop when the source cuts out.
  const end = now + buffer.duration;
  if (buffer.duration > FADE_SEC * 4) {
    gain.gain.setValueAtTime(1, end - FADE_SEC);
    gain.gain.linearRampToValueAtTime(0, end);
  }

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);

  const playback: ActivePlayback = { key, source, gain, onStopped, manual: false };
  source.onended = () => {
    if (playback.manual) return;
    if (active === playback) active = null;
    onStopped();
  };
  active = playback;
  return true;
}

export interface ToneHandle {
  stop: () => void;
  setVolume: (volume: number) => void;
}

export function playTone(frequency: number, volume: number): ToneHandle {
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
  return {
    stop: () => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + FADE_SEC);
      osc.stop(t + FADE_SEC + 0.002);
      // Nodes disconnect themselves once the source stops; delay so the
      // fade-out actually reaches the destination.
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    },
    // Smoothed to avoid zipper noise while dragging the volume slider.
    setVolume: (v: number) => {
      gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
  };
}
