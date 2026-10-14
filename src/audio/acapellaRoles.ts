import type { DecodedAudio } from "./decode";

/** Gain-independent onset strength: fuller mixes often have sharper drum/bass attacks than isolated vocals. A suggestion, never a role guarantee. */
export function transientScore(audio: DecodedAudio): number {
  const channel = audio.channelData[0];
  const hop = Math.max(1, Math.round(audio.sampleRate * 0.02));
  let previous = 0, energy = 0, onsets = 0;
  // Sample windows across the recording rather than scanning every frame of long songs.
  const stride = Math.max(1, Math.floor(channel.length / hop / 6000));
  for (let start = 0; start + hop <= channel.length; start += hop * stride) {
    let current = 0;
    for (let i = start; i < start + hop; i += 4) current += channel[i] ** 2;
    current = Math.sqrt(current / Math.ceil(hop / 4));
    onsets += Math.max(0, current - previous);
    energy += current;
    previous = current;
  }
  return energy > 0 ? onsets / energy : 0;
}

export function suggestedSongIndex(audio: readonly [DecodedAudio, DecodedAudio]): 0 | 1 | null {
  const scores = audio.map(transientScore);
  const high = Math.max(...scores), low = Math.min(...scores);
  if (high < 0.01 || high < low * 1.3) return null;
  return scores[1] > scores[0] ? 1 : 0;
}
