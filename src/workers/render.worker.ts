/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { stretchAndShift } from "../audio/stretch/rubberband";
import { resamplePitchShift } from "../audio/stretch/resample";

/** Transfers (zero-copy) rather than clones the processed buffers back to the main thread. */
function transferChannels(channels: Float32Array[]): Float32Array[] {
  return Comlink.transfer(
    channels,
    channels.map((c) => c.buffer as ArrayBuffer),
  );
}

const api = {
  /** Rubber Band path — loops and the master loop, where exact duration (and, for loops, formants) must be preserved. */
  async process(
    channelData: Float32Array[],
    sampleRate: number,
    timeRatio: number,
    pitchScale: number,
    preserveFormants: boolean,
  ): Promise<Float32Array[]> {
    if (timeRatio === 1 && pitchScale === 1) {
      return transferChannels(channelData);
    }
    const out = await stretchAndShift({ sampleRate, channelData, timeRatio, pitchScale, preserveFormants });
    return transferChannels(out);
  },

  /** Windowed-sinc resample path — one-shots, where crisp transients matter more than fixed duration/formants. */
  async resamplePitch(channelData: Float32Array[], pitchScale: number): Promise<Float32Array[]> {
    return transferChannels(resamplePitchShift(channelData, pitchScale));
  },
};

export type RenderWorkerApi = typeof api;
Comlink.expose(api);
