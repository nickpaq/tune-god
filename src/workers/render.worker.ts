/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { resamplePitchShift } from "../audio/stretch/resample";

const api = {
  /** Windowed-sinc resample: pitch and duration change together, exactly like turning a sampler's pitch knob. */
  resamplePitch(channelData: Float32Array[], pitchScale: number): Float32Array[] {
    const out = resamplePitchShift(channelData, pitchScale);
    return Comlink.transfer(
      out,
      out.map((c) => c.buffer as ArrayBuffer),
    );
  },
};

export type RenderWorkerApi = typeof api;
Comlink.expose(api);
