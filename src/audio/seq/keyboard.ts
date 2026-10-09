export interface KeyboardVoice { release(seconds?: number): void; isEnded?: () => boolean; cut(): void; glide(pitch: number, seconds: number): void; }
export interface KeyboardOptions { mono: boolean; oneShot: boolean; glide: boolean; attackSeconds: number; decaySeconds: number; glideSeconds: number; returnToHeld: boolean; }
export const DEFAULT_KEYBOARD_OPTIONS: KeyboardOptions = { mono: false, oneShot: false, glide: false, attackSeconds: 0, decaySeconds: 0.025, glideSeconds: 0.1, returnToHeld: true };
export function glideEnabled(options: KeyboardOptions): boolean { return options.mono && !options.oneShot && options.glide; }

/** Pointer ownership never changes with finger position. Mono uses last-note priority. */
export function createKeyboardPlayer(start: (pitch: number, velocity: number, attackSeconds: number) => KeyboardVoice, options: () => KeyboardOptions) {
  const held = new Map<number, { pitch: number; velocity: number; voice?: KeyboardVoice }>();
  const voices = new Set<KeyboardVoice>();
  let monoVoice: KeyboardVoice | undefined;
  let activePointer: number | undefined;
  let mode = `${options().mono}:${options().oneShot}`;
  const stop = () => {
    for (const voice of voices) voice.cut();
    voices.clear(); monoVoice = undefined;
    held.clear(); activePointer = undefined;
  };
  const begin = (pitch: number, velocity: number, settings: KeyboardOptions) => {
    const voice = start(pitch, velocity, Math.max(0, settings.attackSeconds));
    voices.add(voice);
    if (voices.size > 64) { const oldest = voices.values().next().value!; oldest.cut(); voices.delete(oldest); }
    return voice;
  };
  return {
    down(pointerId: number, pitch: number, velocity: number) {
      if (held.has(pointerId)) return;
      const settings = options();
      const nextMode = `${settings.mono}:${settings.oneShot}`;
      if (nextMode !== mode) { stop(); mode = nextMode; }
      if (settings.mono) {
        held.set(pointerId, { pitch, velocity });
        if (monoVoice && !monoVoice.isEnded?.() && glideEnabled(settings)) monoVoice.glide(pitch, Math.max(0, settings.glideSeconds));
        else {
          if (monoVoice) { monoVoice.cut(); voices.delete(monoVoice); }
          monoVoice = begin(pitch, velocity, settings);
        }
        activePointer = pointerId;
      } else held.set(pointerId, { pitch, velocity, voice: begin(pitch, velocity, settings) });
    },
    up(pointerId: number) {
      const note = held.get(pointerId);
      if (!note) return;
      held.delete(pointerId);
      const settings = options();
      if (settings.oneShot) return;
      if (!settings.mono) { note.voice?.release(Math.max(0, settings.decaySeconds)); return; }
      if (activePointer !== pointerId) return;
      const previous = [...held.entries()].at(-1);
      if (previous && settings.returnToHeld) {
        activePointer = previous[0];
        if (monoVoice && !monoVoice.isEnded?.() && glideEnabled(settings)) monoVoice.glide(previous[1].pitch, Math.max(0, settings.glideSeconds));
        else {
          if (monoVoice) { monoVoice.cut(); voices.delete(monoVoice); }
          monoVoice = begin(previous[1].pitch, previous[1].velocity, settings);
        }
      } else {
        monoVoice?.release(Math.max(0, settings.decaySeconds)); monoVoice = undefined; activePointer = undefined;
      }
    },
    stop,
    held: () => new Map(held),
  };
}
