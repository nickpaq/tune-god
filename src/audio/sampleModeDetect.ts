import type { SampleAnalysis } from "./analysisTypes";

// Bounded by lookaround on letters only (not \b) so separators like "_" or
// digits still count as a boundary — "Kick_2.wav" must match "kick" even
// though \w (and therefore \b) treats "_" as a word character. Still avoids
// false-positiving on letter-adjacent substrings like "Chatter" or
// "Automate". Deliberately excludes ambiguous terms like "808" (could be a
// tuned bass one-shot or a drum hit).
const DRUM_KEYWORDS =
  /(?<![a-z])(kick|snare|clap|rim ?shot|shaker|tamb(?:ourine)?|hat|hi-?hat|cymbal|crash|ride|tom|perc(?:ussion)?|conga|bongo|cowbell|clave|snap)(?![a-z])/i;

const LOOP_KEYWORDS = /(?<![a-z])(loop|loops)(?![a-z])/i;

/** Same confidence bar the pitch tracker itself uses to decide a frame is "confidently pitched". */
const LOW_PITCH_CONFIDENCE = 0.5;

/**
 * Best-effort guess at how a sample should be treated:
 *  - "drum": a percussive hit — left completely untouched.
 *  - "loop": tuned and time-stretched to the master's BPM via Rubber Band
 *    (preserves exact duration and formants).
 *  - "oneshot": tuned via a simple resample (pitch-shift only, no Rubber
 *    Band/formant preservation), so transients stay crisp and duration
 *    drifts naturally with pitch — the classic sampler-pitch-knob approach.
 * Filename keywords are the only loop signal — duration isn't a reliable
 * proxy (melodic one-shots with long reverb tails are common and easily
 * run past several seconds). Unlabeled tonal content defaults to the safer
 * "oneshot" path rather than risk BPM-stretching something that isn't
 * actually a loop. Always a suggestion — callers should let the user
 * override it via the mode toggle.
 */
export function guessSampleMode(fileName: string, analysis?: SampleAnalysis): "loop" | "oneshot" | "drum" {
  if (DRUM_KEYWORDS.test(fileName)) return "drum";
  if (analysis && analysis.confidence < LOW_PITCH_CONFIDENCE) return "drum";
  if (LOOP_KEYWORDS.test(fileName)) return "loop";
  return "oneshot";
}
