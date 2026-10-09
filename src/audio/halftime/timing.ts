export interface HalftimeSettings {
  bpm: number;
  anchorSeconds: number;
  speed: number;
  mix: number;
  rhythm: boolean;
  stepBeats: number;
  steps: readonly boolean[];
}
export const DEFAULT_RESYNC_STEPS = Array.from({ length: 16 }, (_, i) => i % 8 === 0);
/** Absolute song positions, not repeated source offsets. Disabled steps let the slow voice continue. */
export function resyncPoints(settings: HalftimeSettings, from: number, to: number): number[] {
  if (!(settings.bpm > 0) || !(settings.stepBeats > 0) || to <= from) return [];
  const beat = 60 / settings.bpm;
  const spacing = beat * (settings.rhythm ? settings.stepBeats : 2);
  const pattern = settings.rhythm ? settings.steps : [true];
  if (!pattern.length || !pattern.some(Boolean)) return [];
  const first = Math.ceil((from - settings.anchorSeconds) / spacing - 1e-9);
  const last = Math.ceil((to - settings.anchorSeconds) / spacing - 1e-9);
  const points: number[] = [];
  for (let step = first; step < last; step++) {
    if (!pattern[((step % pattern.length) + pattern.length) % pattern.length]) continue;
    const point = settings.anchorSeconds + step * spacing;
    if (point >= from - 1e-9 && point < to - 1e-9) points.push(Math.max(from, point));
  }
  return points;
}
/** Start playback from the selected normal-speed position, then resync on enabled steps. */
export function playbackSegments(settings: HalftimeSettings, from: number, to: number) {
  const starts = [from, ...resyncPoints(settings, from, to).filter(t => t > from + 1e-8)];
  return starts.map((start, i) => ({ start, end: starts[i + 1] ?? to }));
}
export function sourcePosition(start: number, elapsed: number, speed: number) {
  return start + Math.max(0, elapsed) * speed;
}
