/** The knob is drawn on a grid of this many lit cells each way. */
export const SIZE = 17;
/** The pointer sweeps from 135 degrees left of straight up to 135 degrees right of it. */
export const SWEEP_DEG = 135;

/** The knob as rows of lit cells: a ring, a centre dot and a pointer line turned to `value` (0 to 1). */
export function knobRows(value: number): string[] {
  const c = (SIZE - 1) / 2;
  const grid = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill("."));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d >= c - 1.1 && d <= c + 0.4) grid[y][x] = "#";
    }
  }
  const angle = ((-SWEEP_DEG + 2 * SWEEP_DEG * Math.min(1, Math.max(0, value))) * Math.PI) / 180;
  for (let r = 0; r <= c - 2; r += 0.25) {
    const x = Math.round(c + Math.sin(angle) * r);
    const y = Math.round(c - Math.cos(angle) * r);
    grid[y][x] = "#";
  }
  return grid.map((row) => row.join(""));
}

