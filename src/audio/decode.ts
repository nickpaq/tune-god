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

export interface DecodedAudio {
  sampleRate: number;
  channelData: Float32Array[];
}

/**
 * Reads PCM (8/16/24/32-bit) or float (32/64-bit) WAV data at its own sample rate and bit
 * depth, with no resampling. Returns null for anything else (compressed, malformed).
 */
export function parseWav(bytes: ArrayBuffer): DecodedAudio | null {
  const view = new DataView(bytes);
  if (view.byteLength < 12 || view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57415645) return null;
  let fmt: { tag: number; channels: number; sampleRate: number; bits: number } | null = null;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset);
    let size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 0x666d7420 && size >= 16) {
      let tag = view.getUint16(body, true);
      if (tag === 0xfffe && size >= 26) tag = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE sub-format
      fmt = { tag, channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === 0x64617461 && fmt) {
      size = Math.min(size, view.byteLength - body);
      const { tag, channels, bits } = fmt;
      const bytesPer = bits / 8;
      if (!channels || (tag !== 1 && tag !== 3) || ![1, 2, 3, 4, 8].includes(bytesPer)) return null;
      if ((tag === 3 && bytesPer !== 4 && bytesPer !== 8) || (tag === 1 && bytesPer === 8)) return null;
      const frames = Math.floor(size / (bytesPer * channels));
      const channelData = Array.from({ length: channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let ch = 0; ch < channels; ch++) {
          const at = body + (i * channels + ch) * bytesPer;
          let v: number;
          if (tag === 3) v = bytesPer === 4 ? view.getFloat32(at, true) : view.getFloat64(at, true);
          else if (bytesPer === 1) v = (view.getUint8(at) - 128) / 128;
          else if (bytesPer === 2) v = view.getInt16(at, true) / 0x8000;
          else if (bytesPer === 3) v = ((view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16))) / 0x800000;
          else v = view.getInt32(at, true) / 0x80000000;
          channelData[ch][i] = v;
        }
      }
      return { sampleRate: fmt.sampleRate, channelData };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Decodes a file at its native sample rate when it is a plain WAV, else via the browser (which resamples to the context rate). */
export async function decodeNative(file: File): Promise<DecodedAudio> {
  const bytes = await file.arrayBuffer();
  const wav = parseWav(bytes);
  if (wav && wav.channelData.length > 0 && wav.channelData[0].length > 0) return wav;
  const buffer = await getAudioContext().decodeAudioData(bytes.slice(0));
  return { sampleRate: buffer.sampleRate, channelData: cloneChannelData(buffer) };
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
