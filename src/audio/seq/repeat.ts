import { getAudioContext } from "../decode";
import { playSeqSound, type SeqSound } from "./engine";
import { RepeatGrid } from "./repeatGrid";
export { REPEAT_RATES } from "./repeatRates";
export interface RepeatSettings { bpm: number; rate: number; velocity: number; mono: boolean; oneShot: boolean; attackSeconds: number; decaySeconds: number; }
/** Native audio-clock scheduling; gestures take effect only on their enclosing grid boundary. */
export function startNoteRepeat(sound: () => SeqSound | null, settings: () => RepeatSettings, destination: AudioNode, gridOrigin = 0) {
  const ctx = getAudioContext(); void ctx.resume();
  const bpm = settings().bpm, secondsPerBeat = 60 / Math.max(20, bpm);
  const beatNow = () => Math.max(0, (ctx.currentTime - gridOrigin) / secondsPerBeat);
  const grid = new RepeatGrid();
  let through = beatNow(), lastVoice: ReturnType<typeof playSeqSound> | undefined;
  let timer: number | undefined, ending: number | undefined;
  const voices = new Map<ReturnType<typeof playSeqSound>, number>();
  const finishVoices = (cut: boolean) => {
    for (const [voice, beat] of voices) {
      if (cut || gridOrigin + beat * secondsPerBeat > ctx.currentTime) voice.cut();
      else if (!settings().oneShot) voice.release(settings().decaySeconds);
    }
  };
  const schedule = () => {
    const now = beatNow(), next = now + 0.04 / secondsPerBeat;
    const values = settings();
    for (const beat of grid.events(Math.max(through, now - 0.02 / secondsPerBeat), next)) {
      const data = sound(); if (!data) continue;
      const when = gridOrigin + beat * secondsPerBeat;
      if (values.mono) lastVoice?.cut(when);
      const voice = playSeqSound(data, 0, values.velocity, when, undefined, destination, values.attackSeconds);
      voices.set(voice, beat); lastVoice = voice;
    }
    through = next;
    for (const [voice] of voices) if (voice.isEnded()) voices.delete(voice);
    if (voices.size > 64) { const oldest = voices.keys().next().value!; oldest.cut(); voices.delete(oldest); }
    if (ending !== undefined && now >= ending) { window.clearInterval(timer); timer = undefined; ending = undefined; finishVoices(false); }
  };
  const updateRates = (rates: readonly number[]) => {
    const now = beatNow();
    const boundary = grid.change(rates, now);
    for (const [voice, beat] of voices) if (beat >= boundary - 1e-8 && beat > now) { voice.cut(); voices.delete(voice); }
    through = Math.min(through, boundary);
    ending = rates.length ? undefined : grid.endBeat();
    if (timer === undefined) { through = Math.min(through, now); timer = window.setInterval(schedule, 10); }
    schedule();
  };
  updateRates([settings().rate]);
  return { updateRates, stop: (cut = false) => {
    window.clearInterval(timer); timer = undefined; finishVoices(cut);
    return () => voices.forEach((_beat, voice) => voice.cut());
  } };
}
