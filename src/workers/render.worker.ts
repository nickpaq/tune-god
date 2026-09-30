/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { resamplePitchShift } from "../audio/stretch/resample";
import { balanceMix, type Balance, type BalanceInput } from "../audio/loudness";

const api = {
  /** Windowed-sinc resample: pitch and duration change together, exactly like turning a sampler's pitch knob. */
  resamplePitch(channelData: Float32Array[], pitchScale: number): Float32Array[] {
    const out = resamplePitchShift(channelData, pitchScale);
    return Comlink.transfer(
      out,
      out.map((c) => c.buffer as ArrayBuffer),
    );
  },
  /** Baked gain and knob level per input; runs off the main thread because K-weighting long loops is slow. */
  balance(inputs: BalanceInput[], ceilingDb: number): Balance {
    return balanceMix(inputs, ceilingDb);
  },
};

export type RenderWorkerApi = typeof api;
Comlink.expose(api);
