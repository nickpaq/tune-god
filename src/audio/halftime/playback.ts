import { playbackSegments, type HalftimeSettings } from "./timing";
const FADE_SECONDS = 0.005;
/** Native varispeed in both live and offline playback. Every resync reads the absolute reference position. */
export function scheduleVoice(ctx: BaseAudioContext, buffer: AudioBuffer, destination: AudioNode, speed: number, start: number, end: number, when: number, first: boolean) {
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = speed;
  source.connect(gain).connect(destination);
  const fade = Math.min(FADE_SECONDS, (end - start) / 2);
  gain.gain.setValueAtTime(first ? 1 : 0, when);
  if (!first) gain.gain.linearRampToValueAtTime(1, when + fade);
  const finish = when + end - start;
  gain.gain.setValueAtTime(1, finish);
  gain.gain.linearRampToValueAtTime(0, finish + fade);
  source.start(when, Math.max(0, start));
  source.stop(finish + fade);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  return source;
}

export function startHalftime(ctx: AudioContext, buffer: AudioBuffer, settings: HalftimeSettings, from: number) {
  const when = ctx.currentTime + 0.025;
  const wet = ctx.createGain(), dry = ctx.createGain();
  wet.gain.value = settings.mix;
  dry.gain.value = 1 - settings.mix;
  wet.connect(ctx.destination); dry.connect(ctx.destination);
  const original = ctx.createBufferSource();
  original.buffer = buffer;
  original.connect(dry); original.start(when, from);
  const segments = playbackSegments(settings, from, buffer.duration);
  const voices = new Set<AudioBufferSourceNode>();
  let index = 0, stopped = false;
  const schedule = () => {
    const horizon = ctx.currentTime + 0.25;
    while (index < segments.length && when + segments[index].start - from < horizon) {
      const segment = segments[index];
      const voice = scheduleVoice(ctx, buffer, wet, settings.speed, segment.start, segment.end, when + segment.start - from, index === 0);
      voices.add(voice);
      voice.addEventListener("ended", () => voices.delete(voice));
      index++;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 40);
  return {
    position: () => Math.min(buffer.duration, from + Math.max(0, ctx.currentTime - when)),
    setMix: (mix: number) => { wet.gain.setTargetAtTime(mix, ctx.currentTime, 0.01); dry.gain.setTargetAtTime(1 - mix, ctx.currentTime, 0.01); },
    stop: () => {
      if (stopped) return;
      stopped = true; window.clearInterval(timer);
      original.stop();
      for (const voice of voices) voice.stop();
      wet.disconnect(); dry.disconnect(); original.disconnect();
    },
  };
}

/** Same timing, rates, mix, and crossfades as audition; length and channel count match the original song. */
export async function renderHalftime(buffer: AudioBuffer, settings: HalftimeSettings): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const wet = ctx.createGain(), dry = ctx.createGain();
  wet.gain.value = settings.mix; dry.gain.value = 1 - settings.mix;
  wet.connect(ctx.destination); dry.connect(ctx.destination);
  const original = ctx.createBufferSource(); original.buffer = buffer;
  original.connect(dry); original.start();
  for (const [i, segment] of playbackSegments(settings, 0, buffer.duration).entries()) {
    scheduleVoice(ctx, buffer, wet, settings.speed, segment.start, segment.end, segment.start, i === 0);
  }
  return ctx.startRendering();
}
