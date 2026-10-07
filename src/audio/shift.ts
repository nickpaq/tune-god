// How far a pad is moved in pitch, in semitones. Every tuning ends up on Koala's pitch knob, to two decimals (x.xx), in the app and in the
// file alike. The one exception to "the audio is never touched" is 808 and bass audio, which is rendered onto its nearest semitone (the
// pitch it settles on, read from the second half of the sound); the pitch knob then carries what is left.
import type { Pad } from "../components/PadPanel";
import { referenceOffsetSemitones } from "./theory";

/** Rounds to Koala's pitch-knob precision, two decimals. */
export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Semitones an 808 or bass is rendered by at export so that it sits on its nearest note (0 for any other sound or one with no pitch found). */
export function snapSemitones(pad: Pick<Pad, "category" | "detectedMidi">): number {
  if (pad.category !== "bass" || pad.detectedMidi == null) return 0;
  return round2(Math.round(pad.detectedMidi) - pad.detectedMidi);
}

/**
 * Total semitone shift for a pad, from the original file: the shortest move (never more than 6 up or down) from its exact detected pitch
 * onto the target note, plus the manual trim, to two decimals. An 808 or bass with Tune off sits on its nearest semitone, unless the user switched Tune off on purpose.
 */
export function shiftFor(pad: Pad, projectKey: number | null, a4: number, major = false): number {
  if (!pad.tune) return pad.tuneLocked ? 0 : snapSemitones(pad);
  let target = pad.keyPc ?? projectKey;
  // A loop's detected pitch is its key's relative minor. The key picked on the piano is a minor key (the default) or a major one, whose relative minor is a minor third below.
  if (target !== null && pad.category === "melodicLoop" && major) target = (target + 9) % 12;
  let base = 0;
  if (target !== null && pad.detectedMidi != null) {
    base = (((target - pad.detectedMidi) % 12) + 12) % 12;
    if (base > 6) base -= 12;
    // A loop is moved by whole semitones to the closest note of the key (no cents); anything it is off by, the user tweaks. A single sound's detected pitch
    // is measured against A440, so a different A4 reference moves the target note with it.
    if (pad.category === "melodicLoop") base = Math.round(base);
    else base += referenceOffsetSemitones(a4);
  }
  return round2(base + pad.semis + pad.cents / 100);
}

/** The value for the pad's pitch knob in Koala: the total shift less whatever the render already moved the audio by. */
export function pitchKnobFor(pad: Pad, shift: number): number {
  return round2(shift - snapSemitones(pad));
}
