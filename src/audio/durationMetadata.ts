/** Read container duration at indexing time. No PCM decoding or whole-file reads. */
export async function durationMetadata(source: () => Promise<File>): Promise<number | undefined> {
  const file = await source();
  const read = async (offset: number, length: number) => new DataView(await file.slice(offset, offset + length).arrayBuffer());
  const text = (view: DataView, start: number, length: number) => String.fromCharCode(...new Uint8Array(view.buffer, start, length));
  const head = await read(0, 42);
  const valid = (value: number) => Number.isFinite(value) && value > 0 ? value : undefined;
  if (head.byteLength >= 12 && text(head, 0, 4) === "RIFF" && text(head, 8, 4) === "WAVE") {
    let byteRate = 0;
    let dataSize: number | undefined;
    for (let offset = 12, chunks = 0; offset + 8 <= file.size && chunks < 512; chunks++) {
      const chunk = await read(offset, 24);
      if (chunk.byteLength < 8) break;
      const id = text(chunk, 0, 4);
      const size = chunk.getUint32(4, true);
      if (offset + 8 + size > file.size) return undefined;
      if (id === "fmt " && size >= 16 && chunk.byteLength >= 24) byteRate = chunk.getUint32(16, true);
      if (id === "data") dataSize = size;
      if (byteRate && dataSize !== undefined) return valid(dataSize / byteRate);
      offset += 8 + size + (size % 2);
    }
    return undefined;
  }
  if (head.byteLength >= 42 && text(head, 0, 4) === "fLaC" && (head.getUint8(4) & 127) === 0) {
    const high = head.getUint32(18);
    const low = head.getUint32(22);
    const rate = high >>> 12;
    const samples = (high & 15) * 2 ** 32 + low;
    return valid(samples / rate);
  }
  if (head.byteLength >= 12 && text(head, 0, 4) === "FORM" && /^(AIFF|AIFC)$/.test(text(head, 8, 4))) {
    for (let offset = 12, chunks = 0; offset + 8 <= file.size && chunks < 512; chunks++) {
      const chunk = await read(offset, 26);
      if (chunk.byteLength < 8) break;
      const size = chunk.getUint32(4);
      if (offset + 8 + size > file.size) return undefined;
      if (text(chunk, 0, 4) === "COMM" && size >= 18 && chunk.byteLength >= 26) {
        const exponent = chunk.getUint16(16);
        const mantissa = chunk.getUint32(18) * 2 ** 32 + chunk.getUint32(22);
        const rate = (exponent & 0x8000 ? -1 : 1) * mantissa * 2 ** ((exponent & 0x7fff) - 16383 - 63);
        return valid(chunk.getUint32(10) / rate);
      }
      offset += 8 + size + (size % 2);
    }
    return undefined;
  }
  // Compressed containers: let the browser inspect metadata, without starting playback.
  if (typeof Audio === "undefined") return undefined;
  return new Promise(resolve => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const finish = (duration?: number) => {
      clearTimeout(timeout);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    const timeout = setTimeout(() => finish(), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(valid(audio.duration));
    audio.onerror = () => finish();
    audio.src = url;
  });
}
