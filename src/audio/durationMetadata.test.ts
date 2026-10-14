import { expect, it } from "vitest";
import { durationMetadata } from "./durationMetadata";

const source = (bytes: Uint8Array) => async () => new Blob([new Uint8Array(bytes).buffer]) as File;
const writeText = (bytes: Uint8Array, offset: number, text: string) => bytes.set(new TextEncoder().encode(text), offset);
it("reads WAV duration from byte rate and data size, skipping large non-audio chunks", async () => {
  const bytes = new Uint8Array(100_044 + 160_000);
  const view = new DataView(bytes.buffer);
  writeText(bytes, 0, "RIFF"); writeText(bytes, 8, "WAVE");
  writeText(bytes, 12, "JUNK"); view.setUint32(16, 99_992, true);
  writeText(bytes, 100_012, "fmt "); view.setUint32(100_016, 16, true);
  view.setUint32(100_028, 16_000, true);
  writeText(bytes, 100_036, "data"); view.setUint32(100_040, 160_000, true);
  expect(await durationMetadata(source(bytes))).toBe(10);
});
it("reads FLAC STREAMINFO duration", async () => {
  const bytes = new Uint8Array(42); const view = new DataView(bytes.buffer);
  writeText(bytes, 0, "fLaC"); bytes[4] = 128; bytes[7] = 34;
  view.setUint32(18, 48_000 * 4096); view.setUint32(22, 480_000);
  expect(await durationMetadata(source(bytes))).toBe(10);
});
it("reads AIFF COMM frame count and extended sample rate", async () => {
  const bytes = new Uint8Array(38); const view = new DataView(bytes.buffer);
  writeText(bytes, 0, "FORM"); writeText(bytes, 8, "AIFF"); writeText(bytes, 12, "COMM");
  view.setUint32(16, 18); view.setUint32(22, 441_000);
  view.setUint16(28, 16383 + 15); view.setUint32(30, 44100 * 65536);
  expect(await durationMetadata(source(bytes))).toBe(10);
});
it("rejects truncated headers and impossible durations without PCM decoding", async () => {
  expect(await durationMetadata(source(new Uint8Array(2)))).toBeUndefined();
  const bytes = new Uint8Array(42); writeText(bytes, 0, "fLaC");
  expect(await durationMetadata(source(bytes))).toBeUndefined();
});
