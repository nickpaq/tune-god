import { getAudioContext } from "./decode";

interface ActivePlayback {
  key: string;
  source: AudioBufferSourceNode;
  startCtxTime: number;
  startOffset: number;
  durationSec: number;
  onStopped: () => void;
  /** Set before an intentional stop() so onended doesn't double-fire callbacks. */
  manual: boolean;
}

let active: ActivePlayback | null = null;
// Remembers where each preview was paused so the next tap resumes from there.
const pausedOffsets = new Map<string, number>();

function bufferFromChannelData(channelData: Float32Array[], sampleRate: number): AudioBuffer {
  const ctx = getAudioContext();
  const buffer = ctx.createBuffer(channelData.length, channelData[0].length, sampleRate);
  channelData.forEach((data, ch) => buffer.copyToChannel(new Float32Array(data), ch));
  return buffer;
}

function stopActive(pause: boolean): void {
  if (!active) return;
  const a = active;
  a.manual = true;
  if (pause) {
    const elapsed = a.startOffset + (getAudioContext().currentTime - a.startCtxTime);
    if (elapsed > 0 && elapsed < a.durationSec) {
      pausedOffsets.set(a.key, elapsed);
    } else {
      pausedOffsets.delete(a.key);
    }
  } else {
    pausedOffsets.delete(a.key);
  }
  try {
    a.source.stop();
  } catch {
    // already stopped
  }
  active = null;
  a.onStopped();
}

export function stopPlayback(): void {
  stopActive(false);
}

/**
 * Tap-to-play / tap-to-pause preview. `key` identifies the sound (e.g. a
 * sample id); tapping the same key pauses and remembers the position, tapping
 * a different key stops the current one and starts the new one. Returns true
 * if the sound is now playing. `onStopped` fires whenever this playback ends
 * for any reason (pause, replaced by another preview, or natural end) so the
 * caller can reset its button state.
 */
export function togglePlayback(
  key: string,
  channelData: Float32Array[],
  sampleRate: number,
  onStopped: () => void,
): boolean {
  if (active?.key === key) {
    stopActive(true);
    return false;
  }
  stopActive(false);

  const ctx = getAudioContext();
  const buffer = bufferFromChannelData(channelData, sampleRate);
  const savedOffset = pausedOffsets.get(key) ?? 0;
  // The buffer may have changed since the pause (e.g. re-processed), so clamp.
  const offset = savedOffset < buffer.duration ? savedOffset : 0;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0, offset);

  const playback: ActivePlayback = {
    key,
    source,
    startCtxTime: ctx.currentTime,
    startOffset: offset,
    durationSec: buffer.duration,
    onStopped,
    manual: false,
  };
  source.onended = () => {
    if (playback.manual) return;
    if (active === playback) active = null;
    pausedOffsets.delete(key);
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
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  return {
    stop: () => {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    },
    setVolume: (v: number) => {
      gain.gain.value = v;
    },
  };
}
