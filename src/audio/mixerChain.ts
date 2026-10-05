// Builds the effects the export puts on Koala's mixer strips from the active mix preset (src/audio/mixPresets.ts, where every value
// to tweak lives): a sidechain from the kick bus onto the bass bus, clipping on the kick bus, an EQ on the melodic bus and a master
// chain. Plugin and parameter names are Koala's own (docs/koala-mixer-reference.md). Slots that already hold a plugin are never replaced.
import { ACTIVE_MIX_PRESET, type MasterStyle, type MixPreset } from "./mixPresets";

/** One effect as Koala writes it into a strip's `chain` (five slots, an empty one is null). */
export interface MixerEffect {
  bypass: boolean;
  name: string;
  parameters: Record<string, number>;
}
export type MixerSlot = MixerEffect | null;

const effect = (name: string, parameters: Record<string, number>): MixerEffect => ({ bypass: false, name, parameters });

/** The bus the sidechain listens to: the kick bus (A, bus 0). The SIDECHAIN plugin's `source` is a bus number. Fixed by the bus layout in routing.ts, not a genre choice. */
export const SIDECHAIN_SOURCE_BUS = 0;

/** SIDECHAIN for the bass bus: ducks it whenever the kick bus plays. Values: preset.buses.bassSidechain. */
export const bassSidechain = (preset: MixPreset = ACTIVE_MIX_PRESET): MixerEffect =>
  effect("SIDECHAIN", { source: SIDECHAIN_SOURCE_BUS, ...preset.buses.bassSidechain });

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
