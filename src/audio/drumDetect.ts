import type { SampleAnalysis } from "./analysisTypes";

// Matched as whole words so we don't false-positive on things like
// "Chatter" or "Automate". Deliberately excludes ambiguous terms like
// "808" (could be a tuned bass one-shot or a drum hit).
const DRUM_KEYWORDS =
  /\b(kick|snare|clap|rim ?shot|shaker|tamb(?:ourine)?|hat|hi-?hat|cymbal|crash|ride|tom|perc(?:ussion)?|conga|bongo|cowbell|clave|snap)\b/i;

/** Same confidence bar the pitch tracker itself uses to decide a frame is "confidently pitched". */
const LOW_PITCH_CONFIDENCE = 0.5;

/**
 * Best-effort guess at whether a sample is a drum hit (should default to
 * "Drum" / passthrough) vs. a tonal one-shot (should default to "Tune").
 * Filename keywords are checked first since they're the strongest signal
 * when present (sample-pack files are usually well-labeled); once pitch
 * analysis is available, a sample the tracker couldn't find a confident
 * fundamental for is also treated as percussive. Always a suggestion —
 * callers should let the user override it via the Tune/Drum toggle.
 */
export function guessSampleMode(fileName: string, analysis?: SampleAnalysis): "tune" | "drum" {
  if (DRUM_KEYWORDS.test(fileName)) return "drum";
  if (analysis && analysis.confidence < LOW_PITCH_CONFIDENCE) return "drum";
  return "tune";
}
