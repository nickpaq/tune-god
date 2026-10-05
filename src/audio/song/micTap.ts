// Listens on the microphone for taps (a knock on the back of the phone) and says how long ago each one was. Browser only: the finding itself is in
// tapDetector.ts. The processing node is the old ScriptProcessor, because it works in every browser the app runs on with no extra worker file; blocks are
// small, so a tap's time is known to a few milliseconds.
import { TapDetector } from "./tapDetector";

const BLOCK = 512;

export interface MicTaps {
  stop: () => void;
  setSensitivity: (sensitivity: number) => void;
}

/**
 * Opens the microphone (the browser asks the user the first time) with the processing that tidies speech switched off, since it would flatten a knock,
 * and calls `onTap` with how many seconds ago each tap was. `onLevel` gets the loudest level of each block, for a meter. Rejects if the microphone is
 * refused or missing.
 */
export async function startMicTaps(ctx: AudioContext, sensitivity: number, onTap: (secondsAgo: number) => void, onLevel: (level: number) => void): Promise<MicTaps> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser has no microphone access.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  if (ctx.state === "suspended") void ctx.resume();
  const detector = new TapDetector(ctx.sampleRate, { sensitivity });
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(BLOCK, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.onaudioprocess = (e) => {
    const block = e.inputBuffer.getChannelData(0);
    for (const at of detector.process(block)) onTap((block.length - at) / ctx.sampleRate);
    onLevel(detector.peak);
  };
  // The node only runs while it is connected to the output; the gain keeps the microphone out of the speakers.
  source.connect(node);
  node.connect(mute).connect(ctx.destination);
  return {
    setSensitivity: (value) => detector.setSensitivity(value),
    stop: () => {
      node.onaudioprocess = null;
      source.disconnect();
      node.disconnect();
      mute.disconnect();
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
