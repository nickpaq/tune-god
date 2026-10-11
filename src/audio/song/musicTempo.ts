import MusicTempo from "music-tempo";

/** Music Tempo expects mono audio at 44,100 Hz. Its first tracked beat is a provisional bar 1. */
export function detectMusicTempo(mono: Float32Array): { bpm: number; downbeatSeconds: number } {
  const result = new MusicTempo(mono);
  const bpm = Number(result.tempo);
  const downbeatSeconds = downbeatFromAccents(mono, result.beats);
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(downbeatSeconds)) throw new Error("No beat found");
  return { bpm, downbeatSeconds };
}

/** Use a repeated low-frequency accent only when it clearly separates one bar phase. Ambiguous music keeps the tracked phase. */
export function downbeatFromAccents(mono: Float32Array, beats: number[], sampleRate = 44100, beatsPerBar = 4): number {
  if (beats.length < beatsPerBar * 3) return beats[0];
  const scores = Array<number>(beatsPerBar).fill(0);
  const counts = Array<number>(beatsPerBar).fill(0);
  for (let beat = 0; beat < Math.min(beats.length, 64); beat++) {
    const start = Math.max(0, Math.round((beats[beat] - 0.01) * sampleRate));
    const end = Math.min(mono.length, Math.round((beats[beat] + 0.07) * sampleRate));
    if (end <= start) continue;
    let low = 0, energy = 0;
    const coefficient = 1 - Math.exp(-2 * Math.PI * 800 / sampleRate);
    for (let frame = start; frame < end; frame++) { low += coefficient * (mono[frame] - low); energy += low * low; }
    scores[beat % beatsPerBar] += energy / (end - start);
    counts[beat % beatsPerBar]++;
  }
  if (counts.some((count) => count < 2)) return beats[0];
  const ranked = scores.map((score, phase) => ({ score: score / counts[phase], phase })).sort((a, b) => b.score - a.score);
  return ranked[0].score > Math.max(1e-8, ranked[1].score * 1.3) ? beats[ranked[0].phase] : beats[0];
}
