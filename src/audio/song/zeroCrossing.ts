/**
 * The frame nearest `frame` where the sound crosses zero (within `reach` frames either way), so a cut there does not click. A crossing sits between two
 * samples of opposite sign; the one of the pair closer to zero is returned. With no crossing in reach (or silence-free DC), the frame is returned as it was.
 */
export function zeroCrossingNear(mono: Float32Array, frame: number, reach: number): number {
  const last = mono.length - 1;
  const at = Math.max(0, Math.min(last, Math.round(frame)));
  const crossesAfter = (i: number): boolean => i >= 0 && i < last && (mono[i] === 0 || (mono[i] < 0) !== (mono[i + 1] < 0));
  const closer = (i: number): number => (mono[i] === 0 || Math.abs(mono[i]) <= Math.abs(mono[i + 1]) ? i : i + 1);
  if (crossesAfter(at)) return closer(at);
  for (let d = 1; d <= reach; d++) {
    if (crossesAfter(at + d)) return closer(at + d);
    if (crossesAfter(at - d)) return closer(at - d);
  }
  return at;
}
