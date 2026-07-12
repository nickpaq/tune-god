// Wrapper around the Rubber Band Library (WASM build via `rubberband-wasm`).
// Rubber Band is GPL-licensed (see THIRD_PARTY_NOTICES.md) and chosen for
// its industry-reference quality time-stretching and pitch-shifting with
// independent control of each and formant preservation. This module is the
// single seam an alternative engine (e.g. an MIT-licensed one) would plug
// into if the project's licensing needs change later.
import { RubberBandInterface, RubberBandOption } from "rubberband-wasm";
// Vite resolves this to a fetchable asset URL at build time.
import rubberbandWasmUrl from "rubberband-wasm/dist/rubberband.wasm?url";

export interface StretchOptions {
  sampleRate: number;
  channelData: Float32Array[];
  /** > 1 = slower/longer, < 1 = faster/shorter. 1 = no time change. */
  timeRatio: number;
  /** > 1 = higher pitch, < 1 = lower pitch. 1 = no pitch change. */
  pitchScale: number;
  /** Preserve formants while pitch-shifting (avoids "chipmunk" timbre shift). */
  preserveFormants?: boolean;
}

let rbApiPromise: Promise<any> | null = null;

async function getRubberBand(): Promise<any> {
  if (!rbApiPromise) {
    rbApiPromise = WebAssembly.compileStreaming(fetch(rubberbandWasmUrl)).then((wasm) =>
      RubberBandInterface.initialize(wasm),
    );
  }
  return rbApiPromise;
}

/**
 * Runs Rubber Band offline over a full buffer's worth of channel data.
 * Mirrors the study -> process -> retrieve loop from the library's own demo,
 * driven to completion synchronously (no realtime streaming needed here).
 */
export async function stretchAndShift({
  sampleRate,
  channelData,
  timeRatio,
  pitchScale,
  preserveFormants = true,
}: StretchOptions): Promise<Float32Array[]> {
  const rbApi = await getRubberBand();
  const numChannels = channelData.length;
  const inputLength = channelData[0].length;

  const options =
    RubberBandOption.RubberBandOptionProcessOffline |
    RubberBandOption.RubberBandOptionEngineFiner |
    RubberBandOption.RubberBandOptionPitchHighQuality |
    (preserveFormants ? RubberBandOption.RubberBandOptionFormantPreserved : 0);

  const rbState = rbApi.rubberband_new(sampleRate, numChannels, options, timeRatio, pitchScale);
  const samplesRequired = rbApi.rubberband_get_samples_required(rbState);
  const outputLength = Math.ceil(inputLength * timeRatio) + samplesRequired;
  const outputBuffers = channelData.map(() => new Float32Array(outputLength));

  const channelArrayPtr = rbApi.malloc(numChannels * 4);
  const channelDataPtr: number[] = [];
  let write = 0;

  try {
    for (let ch = 0; ch < numChannels; ch++) {
      const bufferPtr = rbApi.malloc(samplesRequired * 4);
      channelDataPtr.push(bufferPtr);
      rbApi.memWritePtr(channelArrayPtr + ch * 4, bufferPtr);
    }

    rbApi.rubberband_set_expected_input_duration(rbState, inputLength);

    /** Streams the input through `consume(frames, isFinal)` one chunk at a time. */
    const feed = (consume: (frames: number, isFinal: 0 | 1) => void) => {
      for (let read = 0; read < inputLength; ) {
        const frames = Math.min(samplesRequired, inputLength - read);
        channelData.forEach((buf, i) => rbApi.memWrite(channelDataPtr[i], buf.subarray(read, read + frames)));
        read += frames;
        consume(frames, read >= inputLength ? 1 : 0);
      }
    };

    const tryRetrieve = (final: boolean) => {
      for (;;) {
        const available = rbApi.rubberband_available(rbState);
        if (available < 1) break;
        if (!final && available < samplesRequired) break;
        const recv = rbApi.rubberband_retrieve(rbState, channelArrayPtr, Math.min(samplesRequired, available));
        channelDataPtr.forEach((ptr, i) => outputBuffers[i].set(rbApi.memReadF32(ptr, recv), write));
        write += recv;
      }
    };

    // Study pass: Rubber Band's offline engine needs to see the whole signal
    // once before it can produce time-accurate output.
    feed((frames, isFinal) => rbApi.rubberband_study(rbState, channelArrayPtr, frames, isFinal));
    feed((frames, isFinal) => {
      rbApi.rubberband_process(rbState, channelArrayPtr, frames, isFinal);
      tryRetrieve(false);
    });
    tryRetrieve(true);
  } finally {
    channelDataPtr.forEach((ptr) => rbApi.free(ptr));
    rbApi.free(channelArrayPtr);
    rbApi.rubberband_delete(rbState);
  }

  return outputBuffers.map((buf) => buf.subarray(0, write).slice());
}
