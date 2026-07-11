// Minimal PCM WAV writer — avoids pulling in a heavyweight encoding library
// for a well-understood, tiny binary format.

export interface WavEncodeOptions {
  sampleRate: number;
  channelData: Float32Array[];
  bitDepth?: 16 | 24;
}

function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
}

function floatTo24BitPCM(view: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 3) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    const value = Math.round(clamped < 0 ? clamped * 0x800000 : clamped * 0x7fffff);
    view.setUint8(offset, value & 0xff);
    view.setUint8(offset + 1, (value >> 8) & 0xff);
    view.setUint8(offset + 2, (value >> 16) & 0xff);
  }
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/** Interleaves N mono channel arrays into a single Float32Array. */
function interleave(channelData: Float32Array[]): Float32Array {
  const channels = channelData.length;
  const length = channelData[0].length;
  const result = new Float32Array(length * channels);
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      result[i * channels + ch] = channelData[ch][i];
    }
  }
  return result;
}

export function encodeWav({ sampleRate, channelData, bitDepth = 16 }: WavEncodeOptions): Blob {
  const numChannels = channelData.length;
  const interleaved = interleave(channelData);
  const bytesPerSample = bitDepth / 8;
  const dataSize = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  if (bitDepth === 16) {
    floatTo16BitPCM(view, 44, interleaved);
  } else {
    floatTo24BitPCM(view, 44, interleaved);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 16): Blob {
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }
  return encodeWav({ sampleRate: buffer.sampleRate, channelData, bitDepth });
}
