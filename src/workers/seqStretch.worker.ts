import { renderStretch } from "../audio/seq/stretch";
self.onmessage = ({ data }) => {
  try {
    let input: Float32Array[] = data.channels;
    if (data.pitch && Math.abs(data.pitch - 1) > 0.00001)
      input = input.map((c) => {
        const out = new Float32Array(
          Math.max(1, Math.round(c.length / data.pitch)),
        );
        for (let i = 0; i < out.length; i++) {
          const x = i * data.pitch,
            j = Math.floor(x),
            f = x - j;
          out[i] = (c[j] ?? 0) * (1 - f) + (c[j + 1] ?? 0) * f;
        }
        return out;
      });
    const channels = renderStretch(
      input,
      data.sampleRate,
      data.seconds,
      data.mode,
    );
    self.postMessage(
      { id: data.id, channels },
      { transfer: channels.map((c) => c.buffer as ArrayBuffer) },
    );
  } catch (e) {
    self.postMessage({ id: data.id, error: String(e) });
  }
};
