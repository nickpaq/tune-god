// File/ArrayBuffer -> AudioBuffer decoding helpers. Runs entirely client-side
// via the Web Audio API; no data ever leaves the device.

let sharedContext: AudioContext | null = null;

/** A single shared AudioContext for decoding, reused across the session. */
export function getAudioContext(): AudioContext {
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getAudioContext();
  // decodeAudioData detaches the buffer, so callers must not need `file` again.
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

/** Downmixes a (possibly multi-channel) AudioBuffer to a single mono Float32Array. */
export function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

/** Downmixes raw per-channel Float32Arrays (e.g. stored on a SampleItem) to mono. */
export function monoFromChannelData(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0];
  const length = channelData[0].length;
  const mono = new Float32Array(length);
  for (const data of channelData) {
    for (let i = 0; i < length; i++) mono[i] += data[i] / channelData.length;
  }
  return mono;
}

export function cloneChannelData(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channels.push(buffer.getChannelData(ch).slice());
  }
  return channels;
}
