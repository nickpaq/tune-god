// Minimal PCM WAV writer — avoids pulling in a heavyweight encoding library
// for a well-understood, tiny binary format.

export interface WavEncodeOptions {
  sampleRate: number;
  channelData: Float32Array[];
  bitDepth?: 16 | 24;
}

function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array, stride: number): void {
  for (let i = 0; i < input.length; i++, offset += stride) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
}

function floatTo24BitPCM(view: DataView, offset: number, input: Float32Array, stride: number): void {
  for (let i = 0; i < input.length; i++, offset += stride) {
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

export function encodeWav({ sampleRate, channelData, bitDepth = 16 }: WavEncodeOptions): Blob {
  const numChannels = channelData.length;
  const frames = channelData[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const dataSize = frames * numChannels * bytesPerSample;
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

  // Written channel by channel straight into the buffer; no interleaved Float32 copy.
  const stride = numChannels * bytesPerSample;
  channelData.forEach((data, ch) => {
    const write = bitDepth === 16 ? floatTo16BitPCM : floatTo24BitPCM;
    write(view, 44 + ch * bytesPerSample, data, stride);
  });

  return new Blob([buffer], { type: "audio/wav" });
}
