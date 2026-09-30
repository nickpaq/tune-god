/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { resamplePitchShift } from "../audio/stretch/resample";
import { balanceMix, balanceStats, type Balance, type BalanceInput, type BalanceStats } from "../audio/loudness";

const api = {
  /** Windowed-sinc resample: pitch and duration change together, exactly like turning a sampler's pitch knob. */
  resamplePitch(channelData: Float32Array[], pitchScale: number): Float32Array[] {
    const out = resamplePitchShift(channelData, pitchScale);
    return Comlink.transfer(
      out,
      out.map((c) => c.buffer as ArrayBuffer),
    );
  },
  /** Loudness and peak of one sample, so export can measure pads one at a time instead of shipping them all at once. */
  measure(input: BalanceInput): BalanceStats {
    return balanceStats(input);
  },
  /** Baked gain and knob level per input; runs off the main thread because K-weighting long loops is slow. */
  balance(inputs: BalanceInput[], ceilingDb: number): Balance {
    return balanceMix(inputs, ceilingDb);
  },
};

export type RenderWorkerApi = typeof api;
Comlink.expose(api);
