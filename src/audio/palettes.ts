import { CATEGORY_TONE, TONES, type CategoryId, type ToneId } from "./classify";

export interface Palette {
  id: string;
  name: string;
  /** One hex per base tone, in TONES order: kick, snare and clap, hats, perc and vox, fx, bass, melodic, other, drum and perc loops, melodic loop. */
  colors: string[];
}

/*
 * Palettes are built in OKLCH, so every palette is balanced by construction: its tones share one lightness and one
 * colourfulness, and differ only where a difference means something.
 *
 * Where each colour goes is the same in every palette. Drums are the warm half of the wheel (kick red, snare orange,
 * perc amber, hats yellow), loops sit in the greens and teals, melodic sounds are blue, bass is a deep indigo, FX are
 * magenta and Other is a quiet neutral. Hats are the lightest tone and bass the darkest, like the sounds themselves.
 */

/** Hue (degrees), lightness offset and chroma factor for each tone, in TONES order. */
const ROLES: Record<ToneId, { h: number; dl: number; c: number }> = {
  kick: { h: 24, dl: -0.05, c: 1.05 },
  snareClap: { h: 50, dl: 0.02, c: 1 },
  hats: { h: 100, dl: 0.17, c: 0.85 },
  percVox: { h: 70, dl: 0.09, c: 0.62 },
  fx: { h: 340, dl: 0, c: 0.95 },
  bass: { h: 282, dl: -0.2, c: 0.9 },
  melodic: { h: 238, dl: 0.03, c: 0.9 },
  other: { h: 80, dl: 0.06, c: 0.12 },
  drumPercLoop: { h: 152, dl: 0, c: 0.85 },
  melodicLoop: { h: 196, dl: -0.03, c: 0.85 },
};

interface PaletteSpec {
  id: string;
  name: string;
  /** Lightness of the base tones (0 to 1). */
  l: number;
  /** Chroma of the base tones; out-of-gamut colours are pulled in. */
  c: number;
  /** How far the per-tone lightness offsets reach (1 = as in ROLES). */
  spread?: number;
  /** Lightness per tone, in place of the offsets (a palette without hue tells its tones apart by lightness alone). */
  ls?: Record<ToneId, number>;
}

const SPECS: PaletteSpec[] = [
  { id: "koala", name: "Koala", l: 0.7, c: 0.15 },
  { id: "studio", name: "Studio", l: 0.67, c: 0.085 },
  { id: "vintage", name: "Vintage", l: 0.66, c: 0.11, spread: 0.8 },
  { id: "pastel", name: "Pastel", l: 0.84, c: 0.075, spread: 0.55 },
  { id: "neon", name: "Neon", l: 0.75, c: 0.24, spread: 0.7 },
  { id: "midnight", name: "Midnight", l: 0.55, c: 0.12, spread: 0.8 },
  {
    id: "grayscale",
    name: "Grayscale",
    l: 0.58,
    c: 0,
    ls: { kick: 0.32, snareClap: 0.5, hats: 0.9, percVox: 0.72, fx: 0.44, bass: 0.2, melodic: 0.62, other: 0.8, drumPercLoop: 0.38, melodicLoop: 0.56 },
  },
];

function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** An OKLCH colour as sRGB hex, keeping its lightness and hue and giving up chroma until it fits. */
export function oklchToHex(l: number, c: number, h: number): string {
  l = Math.max(0, Math.min(1, l));
  let rgb = oklchToRgb(l, c, h);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToRgb(l, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToRgb(l, lo, h);
  }
  const encode = (v: number) => {
    const x = Math.max(0, Math.min(1, v));
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  };
  return "#" + rgb.map((v) => encode(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** A hex colour in OKLCH: [lightness, chroma, hue]. */
export function hexToOklch(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const lc = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mc = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sc = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
  const a = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
  const bb = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return [l, Math.hypot(a, bb), h < 0 ? h + 360 : h];
}

function build(spec: PaletteSpec): Palette {
  const spread = spec.spread ?? 1;
  return {
    id: spec.id,
    name: spec.name,
    colors: TONES.map((t) => {
      const r = ROLES[t];
      return oklchToHex(spec.ls?.[t] ?? spec.l + r.dl * spread, spec.c * r.c, r.h);
    }),
  };
}

export const PALETTES: Palette[] = SPECS.map(build);

export const DEFAULT_PALETTE_ID = "koala";

export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** The palette's base colour for a tone. */
export function toneColor(palette: Palette, tone: ToneId): string {
  return palette.colors[TONES.indexOf(tone)] ?? palette.colors[palette.colors.length - 1];
}

/** How many shades a category sits from its tone's base colour (0 = the base itself). */
const SHADE: Partial<Record<CategoryId, number>> = { clap: 1, openHat: 1, cymbal: 2, vox: 1, percLoop: 1 };
/** OKLCH lightness moved per shade. */
const SHADE_STEP = 0.085;

/** `hex` moved `steps` shades away from its own lightness: lighter when the colour is dark, darker when it is light, keeping its hue. */
export function shade(hex: string, steps: number): string {
  if (steps === 0) return hex;
  const [l, c, h] = hexToOklch(hex);
  const lighter = l < 0.62;
  // A yellow that only got darker would turn olive, so it leans toward gold as it darkens.
  const hue = !lighter && h > 80 && h < 125 ? h - 4 * steps : h;
  return oklchToHex(lighter ? l + steps * SHADE_STEP : l - steps * SHADE_STEP, c, hue);
}

/** A category's pad colour: its tone's base colour, shaded so related sounds (snare and clap) read as family. */
export function colorFor(palette: Palette, category: CategoryId): string {
  return shade(toneColor(palette, CATEGORY_TONE[category]), SHADE[category] ?? 0);
}

/** Black or white, whichever reads better over `hex`. */
export function textColorOn(hex: string): string {
  return hexToOklch(hex)[0] > 0.66 ? "#000" : "#fff";
}
