import * as Comlink from "comlink";
import { guess } from "web-audio-beat-detector";
import { nextAnalysisWorker } from "../../workers/workerClient";

export type BeatDetector = "music-tempo" | "web-audio";

/** Both libraries find beats, not bar phase. A user marker supplies the exact musical downbeat. */
export async function detectSongTempo(mono: Float32Array, sampleRate: number, method: BeatDetector, anchorFrame: number | null) {
  const first = anchorFrame === null ? 0 : Math.max(0, Math.min(mono.length - 1, Math.round(anchorFrame)));
  const audio = mono.subarray(first);
  if (audio.length < sampleRate * 2) throw new Error("Not enough audio after the downbeat");
  const buffer = new AudioBuffer({ numberOfChannels: 1, length: audio.length, sampleRate });
  buffer.getChannelData(0).set(audio);

  let result: { bpm: number; downbeatSeconds: number };
  if (method === "music-tempo") {
    const offline = new OfflineAudioContext(1, Math.ceil(audio.length * 44100 / sampleRate), 44100);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const copy = rendered.getChannelData(0).slice();
    result = await nextAnalysisWorker().detectMusicTempo(Comlink.transfer(copy, [copy.buffer]));
  } else {
    // Use the library's native low-pass and worker, with its default tempo range (90–180 BPM).
    const detected = await guess(buffer);
    result = { bpm: detected.bpm, downbeatSeconds: detected.offset };
  }
  if (!Number.isFinite(result.bpm) || result.bpm <= 0 || !Number.isFinite(result.downbeatSeconds)) throw new Error("No beat found");
  return { bpm: result.bpm, downbeatSeconds: anchorFrame === null ? result.downbeatSeconds : first / sampleRate };
}
