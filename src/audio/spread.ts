/**
 * Balanced random stereo spread. Items are shuffled and paired; each pair gets
 * the same random distance from centre in opposite directions (e.g. L25 / R25),
 * and an odd one out stays centred. Returns pan offsets in percent, -maxPercent
 * (left) to +maxPercent (right), one per item in input order.
 */
export function balancedSpread(count: number, maxPercent: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const result = new Array<number>(count).fill(0);
  for (let i = 0; i + 1 < order.length; i += 2) {
    const amount = 1 + Math.floor(random() * maxPercent);
    const side = random() < 0.5 ? -1 : 1;
    result[order[i]] = side * amount;
    result[order[i + 1]] = -side * amount;
  }
  return result;
}
