// Colours for the individual drum roles in a finger-drumming layout. The palette gives drums only four
// colours (kick, snare, hat, perc), which are often near-identical shades, so each role instead takes the
// palette colour furthest from the ones already handed out. Still only the palette's own colours.
import type { DrumRole } from "./drumRoles";
import { colorFor, type Palette } from "./palettes";

/** Handed out in this order: the core drums get the most distinct colours. */
const ROLE_ORDER: DrumRole[] = ["kick", "snare", "closedHat", "openHat", "perc", "tom", "crash", "ride", "clap", "rim"];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "Redmean" colour distance: a cheap approximation of how different two colours look. */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

export function roleColors(palette: Palette): Record<DrumRole, string> {
  const colors = [...new Set(palette.colors)];
  const chosen: string[] = [colorFor(palette, "kick")];
  const out = { kick: chosen[0] } as Record<DrumRole, string>;
  for (const role of ROLE_ORDER.slice(1)) {
    let best = colors[0];
    let bestScore = -1;
    for (const c of colors) {
      const score = Math.min(...chosen.map((o) => distance(c, o)));
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    out[role] = best;
    chosen.push(best);
  }
  return out;
}
