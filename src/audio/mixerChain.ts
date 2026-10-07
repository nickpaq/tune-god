// Builds the effects the export puts on Koala's mixer strips from the active mix preset (src/audio/mixPresets.ts, where every value
// to tweak lives): clipping on the kick bus, an EQ on the melodic bus and a master
// chain. Plugin and parameter names are Koala's own (docs/koala-mixer-reference.md). Bus plugins are added after any plugins already on the strip (never replacing one, never doubling one that is there); the master chain replaces the master strip, and the app warns first.
import { ACTIVE_MIX_PRESET, type MasterStyle, type MixPreset } from "./mixPresets";

/** One effect as Koala writes it into a strip's `chain` (five slots, an empty one is null). */
export interface MixerEffect {
  bypass: boolean;
  name: string;
  parameters: Record<string, number>;
}
export type MixerSlot = MixerEffect | null;

const effect = (name: string, parameters: Record<string, number>): MixerEffect => ({ bypass: false, name, parameters });

/** CLIPPER for the kick bus. Values: preset.buses.kickClipper. */
export const kickClipper = (preset: MixPreset = ACTIVE_MIX_PRESET): MixerEffect => effect("CLIPPER", { ...preset.buses.kickClipper });

/** EQ for the melodic bus (lo highpass, mid bell, hi high shelf). Values: preset.buses.melodicEq. */
export const melodicEq = (preset: MixPreset = ACTIVE_MIX_PRESET): MixerEffect => effect("EQ", { ...preset.buses.melodicEq });

/** The master chain of a style, in signal order. Values: preset.master[style]. */
export const masterChain = (style: MasterStyle = "loud", preset: MixPreset = ACTIVE_MIX_PRESET): MixerEffect[] => preset.master[style].map((fx) => effect(fx.name, { ...fx.parameters }));

/** Puts each effect, in order, into the first empty slot after the previous one. Returns false (and changes nothing) when they do not all fit. */
export function fillEmptySlots(chain: MixerSlot[], effects: MixerEffect[]): boolean {
  const slots = [...chain];
  let at = 0;
  for (const fx of effects) {
    while (at < slots.length && slots[at]) at++;
    if (at >= slots.length) return false;
    slots[at++] = fx;
  }
  chain.splice(0, chain.length, ...slots);
  return true;
}

/** Puts the effects, in order, after the last effect already in the strip, so the user's own plugins keep their place at the front. Returns false (and changes nothing) when they do not fit. */
export function appendAfterExisting(chain: MixerSlot[], effects: MixerEffect[]): boolean {
  let last = -1;
  chain.forEach((fx, i) => {
    if (fx) last = i;
  });
  if (last + 1 + effects.length > chain.length) return false;
  effects.forEach((fx, i) => (chain[last + 1 + i] = fx));
  return true;
}
