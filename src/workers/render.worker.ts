/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { stretchAndShift } from "../audio/stretch/rubberband";

const api = {
  async process(
    channelData: Float32Array[],
    sampleRate: number,
    timeRatio: number,
    pitchScale: number,
    preserveFormants: boolean,
  ): Promise<Float32Array[]> {
    if (timeRatio === 1 && pitchScale === 1) {
      return channelData;
    }
    return stretchAndShift({ sampleRate, channelData, timeRatio, pitchScale, preserveFormants });
  },
};

export type RenderWorkerApi = typeof api;
Comlink.expose(api);
