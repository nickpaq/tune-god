import { expect, it, vi } from "vitest";
import { createKeyboardPlayer, DEFAULT_KEYBOARD_OPTIONS, glideEnabled } from "./keyboard";
it("keeps one mono voice and glides between held keys over the selected time", () => {
  const voice = { release: vi.fn(), cut: vi.fn(), glide: vi.fn() };
  const start = vi.fn(() => voice);
  const keyboard = createKeyboardPlayer(start, () => ({ ...DEFAULT_KEYBOARD_OPTIONS, mono: true, glide: true, glideSeconds: 0.35, returnToHeld: true }));
  keyboard.down(1, 0, 100); keyboard.down(2, 7, 100);
  expect(start).toHaveBeenCalledTimes(1);
  expect(voice.glide).toHaveBeenLastCalledWith(7, 0.35);
  keyboard.up(2);
  expect(voice.glide).toHaveBeenLastCalledWith(0, 0.35);
  expect(voice.release).not.toHaveBeenCalled();
  keyboard.up(1); expect(voice.release).toHaveBeenCalledTimes(1);
});
it("ignores duplicate presses for an owned pointer and releases only that pointer's voice", () => {
  const voices = Array.from({ length: 2 }, () => ({ release: vi.fn(), cut: vi.fn(), glide: vi.fn() }));
  let index = 0; const start = vi.fn((_pitch: number, _velocity: number) => voices[index++]);
  const keyboard = createKeyboardPlayer(start, () => ({ ...DEFAULT_KEYBOARD_OPTIONS, mono: false, glideSeconds: 1, returnToHeld: true }));
  keyboard.down(1, 0, 100); keyboard.down(1, 7, 100); keyboard.down(2, 4, 100);
  expect(start.mock.calls.map(call => call[0])).toEqual([0, 4]);
  keyboard.up(1); expect(voices[0].release).toHaveBeenCalledTimes(1);
  expect(voices[1].release).not.toHaveBeenCalled();
  keyboard.stop(); expect(voices[1].cut).toHaveBeenCalledTimes(1);
});

it("one-shot mono cuts the previous voice immediately and ignores key release", () => {
  const voices = Array.from({ length: 2 }, () => ({ release: vi.fn(), cut: vi.fn(), glide: vi.fn() }));
  let i = 0;
  const settings = { ...DEFAULT_KEYBOARD_OPTIONS, mono: true, oneShot: true, glide: true };
  const keyboard = createKeyboardPlayer(() => voices[i++], () => settings);
  keyboard.down(1, 0, 100); keyboard.down(2, 7, 100);
  expect(voices[0].cut).toHaveBeenCalledTimes(1);
  expect(voices[0].glide).not.toHaveBeenCalled();
  keyboard.up(2); keyboard.up(1);
  expect(voices[1].release).not.toHaveBeenCalled();
  expect(glideEnabled(settings)).toBe(false);
});
it("uses attack on new voices and independent short release fades in poly mode", () => {
  const voice = { release: vi.fn(), cut: vi.fn(), glide: vi.fn() };
  const start = vi.fn((_pitch: number, _velocity: number, _attack: number) => voice);
  const keyboard = createKeyboardPlayer(start, () => ({ ...DEFAULT_KEYBOARD_OPTIONS, attackSeconds: 0.2, decaySeconds: 0.04 }));
  keyboard.down(1, 0, 100); expect(start).toHaveBeenCalledWith(0, 100, 0.2);
  keyboard.up(1); expect(voice.release).toHaveBeenCalledWith(0.04);
});
