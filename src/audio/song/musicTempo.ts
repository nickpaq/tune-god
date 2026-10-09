import MusicTempo from "music-tempo";

/** Music Tempo expects mono audio at 44,100 Hz. Its first tracked beat is a provisional bar 1. */
export function detectMusicTempo(mono: Float32Array): { bpm: number; downbeatSeconds: number } {
  const result = new MusicTempo(mono);
  const bpm = Number(result.tempo);
  const downbeatSeconds = result.beats[0];
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(downbeatSeconds)) throw new Error("No beat found");
  return { bpm, downbeatSeconds };
}
