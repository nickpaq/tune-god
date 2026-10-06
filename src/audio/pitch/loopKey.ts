// The key of a melodic loop. A loop holds several notes at once, so YIN (which finds one fundamental) is the wrong tool: this reads how much of each of the
// twelve notes the loop holds (the chroma, already corrected for a loop that is tuned off A=440) and matches it against the major and minor key profiles,
// the same way the chop editor finds the key of a song.
//
// The answer is always the key's relative minor, because a major key and its relative minor use the same seven notes: C major and A minor are one
// answer, and mixing them up is the commonest mistake a key finder makes. It is a whole note (no cents): the loop is tuned by whole semitones.
import { chromaOf, keyOfChroma } from "../song/beats";

export interface LoopKey {
  /** The relative minor's tonic as a pitch class: 0 = C ... 11 = B. */
  minorPc: number;
  /** The same note as a whole MIDI number (octave 3), so it can be used where a detected pitch is. */
  midi: number;
  /** 0..1: how far the best key stands above its nearest real rival. */
  confidence: number;
}

/** The loop's key, or null when it holds no notes that stand out (a drum loop, noise, or a loop too short to measure). */
export function loopKey(mono: Float32Array, sampleRate: number): LoopKey | null {
  const chroma = chromaOf(mono, sampleRate);
  if (!chroma.some((v) => v > 0)) return null;
  const key = keyOfChroma(chroma);
  const minorPc = key.minor ? key.pc : (key.pc + 9) % 12;
  return { minorPc, midi: 48 + minorPc, confidence: key.confidence };
}
