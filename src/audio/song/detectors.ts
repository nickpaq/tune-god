import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../../workers/workerClient";

/** Analyze the whole song once. Anchors only offset the resulting grid; they never change this input. */
export async function detectSongTempo(mono: Float32Array, sampleRate: number) {
  if (mono.length < sampleRate * 2) throw new Error("Not enough audio to detect a beat");
  let copy: Float32Array;
  if (sampleRate === 44100) copy = mono.slice();
  else {
    const buffer = new AudioBuffer({ numberOfChannels: 1, length: mono.length, sampleRate });
    buffer.getChannelData(0).set(mono);
    const offline = new OfflineAudioContext(1, Math.ceil(mono.length * 44100 / sampleRate), 44100);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    copy = (await offline.startRendering()).getChannelData(0).slice();
  }
  return nextAnalysisWorker().detectMusicTempo(Comlink.transfer(copy, [copy.buffer]));
}
