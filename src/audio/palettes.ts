import { CATEGORY_TONE, TONES, type CategoryId, type ToneId } from "./classify";

export interface Palette {
  id: string;
  name: string;
  /** One hex per base tone, in TONES order: kick, snare and clap, hats, perc and vox, fx, bass, melodic, other, drum and perc loops, melodic loop. */
  colors: string[];
  /** Hand-picked colours for every sound type, used in place of shading the base tones. */
  categories?: Record<CategoryId, string>;
  /** The scheme's lamp colour: lit keys and switches, the primary key, knobs and the menu's highlights. */
  accent: string;
  /** The hue (degrees) the chassis, keys and menu are faintly tinted with. Left out, they stay Graphite grey. */
  surface?: number;
}

/*
 * Palettes are built in OKLCH, so every palette is balanced by construction: its tones share one lightness and one
 * colourfulness, and differ only where a difference means something. Each palette lays its own hues around the wheel
 * (see `hues` below) so they look like different schemes, not one scheme at different strengths, but all follow the same
 * rules: snare, hats (and so cymbals) and perc sit about a third of the wheel from one another, since they are the
 * sounds most often next to each other and must never blur together; hats are the lightest tone and bass the darkest,
 * like the sounds themselves; and Other is a quiet grey.
 */

/** Default hue (degrees), lightness offset and chroma factor for each tone; a palette may move the hues. */
export const ROLES: Record<ToneId, { h: number; dl: number; c: number }> = {
  kick: { h: 22, dl: -0.03, c: 1.05 },
  snareClap: { h: 354, dl: 0.03, c: 0.95 },
  fx: { h: 322, dl: -0.02, c: 1 },
  percVox: { h: 296, dl: 0.04, c: 0.85 },
  bass: { h: 272, dl: -0.18, c: 0.95 },
  melodic: { h: 248, dl: 0, c: 0.9 },
  melodicLoop: { h: 228, dl: 0.05, c: 0.8 },
  hats: { h: 190, dl: 0.13, c: 0.7 },
  drumPercLoop: { h: 152, dl: 0.02, c: 0.85 },
  other: { h: 250, dl: 0.06, c: 0.12 },
};

export interface PaletteSpec {
  id: string;
  name: string;
  /** Hues (degrees) for the tones, replacing the defaults in ROLES. */
  hues?: Partial<Record<ToneId, number>>;
  /** Lightness of the base tones (0 to 1). */
  l: number;
  /** Chroma of the base tones; out-of-gamut colours are pulled in. */
  c: number;
  /** How far the per-tone lightness offsets reach (1 = as in ROLES). */
  spread?: number;
  /** Lightness per tone, in place of the offsets (a palette without hue tells its tones apart by lightness alone). */
  ls?: Record<ToneId, number>;
  /** The scheme's lamp colour (hex). */
  accent: string;
  /** The hue the chassis and menu are tinted with; left out, Graphite grey. */
  surface?: number;
}

export const SPECS: PaletteSpec[] = [
  // Koala: the whole wheel, evenly: red kick, rose snare, cyan hats, green perc and vox, violet bass.
  { id: "koala", name: "Koala", l: 0.68, c: 0.16, hues: { kick: 25, snareClap: 350, hats: 205, percVox: 135, fx: 315, bass: 298, melodic: 268, melodicLoop: 238, drumPercLoop: 80 }, accent: "#ff4d5e", surface: 20 },
  // Studio: dusty and cool, with sand and rust as the warm accents.
  { id: "studio", name: "Studio", l: 0.66, c: 0.11, spread: 0.85, hues: { kick: 38, snareClap: 205, hats: 95, percVox: 325, fx: 170, bass: 262, melodic: 235, melodicLoop: 18, drumPercLoop: 150 }, accent: "#e0a458", surface: 225 },
  // Pastel: candy, warm from rose through apricot to butter, with mint, sky and lilac against it.
  { id: "pastel", name: "Pastel", l: 0.83, c: 0.095, spread: 0.55, hues: { kick: 8, snareClap: 58, hats: 178, percVox: 298, fx: 340, bass: 275, melodic: 245, melodicLoop: 215, drumPercLoop: 105 }, accent: "#ff9eb5" },
  // Neon: hot and electric, and the one palette that runs magenta, lime and orange together.
  { id: "neon", name: "Neon", l: 0.72, c: 0.25, spread: 0.7, hues: { kick: 40, snareClap: 335, hats: 120, percVox: 215, fx: 300, bass: 265, melodic: 175, melodicLoop: 15, drumPercLoop: 145 }, accent: "#b6ff00", surface: 300 },
  // Midnight: deep jewel tones: ruby, emerald, sapphire, amethyst and gold.
  { id: "midnight", name: "Midnight", l: 0.56, c: 0.14, spread: 0.8, hues: { kick: 18, snareClap: 160, hats: 90, percVox: 300, fx: 345, bass: 255, melodic: 225, melodicLoop: 200, drumPercLoop: 45 }, accent: "#ffc83d", surface: 265 },
  // Sunset: the warm end of the wheel, from vermilion through apricot to magenta.
  { id: "sunset", name: "Sunset", l: 0.7, c: 0.16, hues: { kick: 28, snareClap: 346, hats: 88, percVox: 52, fx: 335, bass: 318, melodic: 358, melodicLoop: 40, drumPercLoop: 70 }, accent: "#ff7a3d", surface: 30 },
  // Ocean: blues and teals, with sea-foam hats and a coral kick for something to hit against.
  { id: "ocean", name: "Ocean", l: 0.64, c: 0.12, spread: 0.9, hues: { kick: 30, snareClap: 195, hats: 114, percVox: 285, fx: 285, bass: 268, melodic: 225, melodicLoop: 205, drumPercLoop: 170 }, accent: "#28b6d6", surface: 235 },
  // Deep sea: the same water, an hour after dark.
  { id: "deepsea", name: "Deep sea", l: 0.5, c: 0.12, spread: 0.8, hues: { kick: 20, snareClap: 145, hats: 135, percVox: 250, fx: 285, bass: 262, melodic: 205, melodicLoop: 230, drumPercLoop: 160 }, accent: "#1fd1c1", surface: 215 },
  // Forest: bark, moss and fern, with a rust kick.
  { id: "forest", name: "Forest", l: 0.58, c: 0.11, hues: { kick: 35, snareClap: 30, hats: 124, percVox: 195, fx: 62, bass: 168, melodic: 140, melodicLoop: 160, drumPercLoop: 75 }, accent: "#6bbf59", surface: 150 },
  // Moss: soft lichen greens and warm earth.
  { id: "moss", name: "Moss", l: 0.6, c: 0.1, spread: 0.9, hues: { kick: 55, snareClap: 16, hats: 118, percVox: 166, fx: 85, bass: 175, melodic: 135, melodicLoop: 195, drumPercLoop: 100 }, accent: "#9acd32", surface: 125 },
  // Jungle: parrot colours under a canopy.
  { id: "tropical", name: "Tropical", l: 0.72, c: 0.19, spread: 0.75, hues: { kick: 22, snareClap: 350, hats: 100, percVox: 205, fx: 320, bass: 282, melodic: 165, melodicLoop: 130, drumPercLoop: 62 }, accent: "#00d1a0", surface: 170 },
  // Candy: bubblegum, lemonade and mint.
  { id: "candy", name: "Candy", l: 0.78, c: 0.15, spread: 0.6, hues: { kick: 355, snareClap: 32, hats: 200, percVox: 300, fx: 330, bass: 285, melodic: 260, melodicLoop: 235, drumPercLoop: 150 }, accent: "#ff5fa8", surface: 345 },
  // Cherry blossom: petals, new leaves and a little sky.
  { id: "blossom", name: "Blossom", l: 0.8, c: 0.11, spread: 0.8, hues: { kick: 5, snareClap: 45, hats: 140, percVox: 268, fx: 330, bass: 295, melodic: 22, melodicLoop: 355, drumPercLoop: 168 }, accent: "#ff8fb1", surface: 350 },
  // Lavender: violets and lilacs, with cool mint hats.
  { id: "lavender", name: "Lavender", l: 0.72, c: 0.1, spread: 0.7, hues: { kick: 322, snareClap: 16, hats: 205, percVox: 261, fx: 305, bass: 275, melodic: 255, melodicLoop: 235, drumPercLoop: 175 }, accent: "#b48cff", surface: 290 },
  // Citrus: lemon, lime, orange and grapefruit.
  { id: "citrus", name: "Citrus", l: 0.76, c: 0.17, spread: 0.7, hues: { kick: 42, snareClap: 12, hats: 105, percVox: 135, fx: 75, bass: 152, melodic: 92, melodicLoop: 122, drumPercLoop: 168 }, accent: "#ffd21f", surface: 100 },
  // Desert: sand, clay and sage, sun-bleached.
  { id: "desert", name: "Desert", l: 0.66, c: 0.12, spread: 1, hues: { kick: 40, snareClap: 72, hats: 158, percVox: 340, fx: 350, bass: 322, melodic: 55, melodicLoop: 30, drumPercLoop: 140 }, accent: "#e69a4a", surface: 60 },
  // Rose gold: blush, copper and champagne.
  { id: "rosegold", name: "Rose gold", l: 0.72, c: 0.11, spread: 1, hues: { kick: 28, snareClap: 4, hats: 135, percVox: 250, fx: 356, bass: 330, melodic: 38, melodicLoop: 14, drumPercLoop: 58 }, accent: "#e8a190", surface: 20 },
  // Volcano: lava, ash and sulphur.
  { id: "volcano", name: "Volcano", l: 0.6, c: 0.17, spread: 0.85, hues: { kick: 28, snareClap: 52, hats: 104, percVox: 350, fx: 355, bass: 330, melodic: 40, melodicLoop: 18, drumPercLoop: 70 }, accent: "#ff4a1c", surface: 25 },
  // Aurora: northern lights over snow.
  { id: "aurora", name: "Aurora", l: 0.7, c: 0.16, spread: 0.75, hues: { kick: 350, snareClap: 130, hats: 76, percVox: 212, fx: 300, bass: 276, melodic: 190, melodicLoop: 245, drumPercLoop: 165 }, accent: "#45f0b0", surface: 170 },
  // Arctic: ice and pale sky.
  { id: "arctic", name: "Arctic", l: 0.74, c: 0.1, spread: 1, hues: { kick: 350, snareClap: 205, hats: 90, percVox: 322, fx: 285, bass: 250, melodic: 222, melodicLoop: 242, drumPercLoop: 175 }, accent: "#7fd4ff", surface: 225 },
  // Cyberpunk: hot pink, cyan and acid yellow on a dark street.
  { id: "cyberpunk", name: "Cyberpunk", l: 0.7, c: 0.24, spread: 0.7, hues: { kick: 352, snareClap: 195, hats: 108, percVox: 300, fx: 272, bass: 288, melodic: 330, melodicLoop: 222, drumPercLoop: 60 }, accent: "#ff2bd6", surface: 310 },
  // Vaporwave: pink, teal and lilac, in the afternoon sun.
  { id: "vaporwave", name: "Vaporwave", l: 0.76, c: 0.13, spread: 0.65, hues: { kick: 352, snareClap: 344, hats: 190, percVox: 264, fx: 300, bass: 270, melodic: 205, melodicLoop: 242, drumPercLoop: 155 }, accent: "#ff71ce", surface: 300 },
  // Royal: purple, gold and wine.
  { id: "royal", name: "Royal", l: 0.55, c: 0.15, spread: 0.85, hues: { kick: 82, snareClap: 342, hats: 108, percVox: 272, fx: 320, bass: 285, melodic: 270, melodicLoop: 250, drumPercLoop: 42 }, accent: "#e6b800", surface: 285 },
  // Sepia: an old photograph: one brown, told apart by lightness.
  { id: "sepia", name: "Sepia", l: 0.6, c: 0.05, hues: { kick: 62, snareClap: 62, hats: 62, percVox: 62, fx: 62, bass: 62, melodic: 62, melodicLoop: 62, drumPercLoop: 62, other: 62 }, ls: { kick: 0.3, snareClap: 0.56, hats: 0.96, percVox: 0.2, fx: 0.47, bass: 0.07, melodic: 0.66, other: 0.86, drumPercLoop: 0.42, melodicLoop: 0.74 }, accent: "#c9923f", surface: 65 },
  // Blueprint: one blue, told apart by lightness.
  { id: "blueprint", name: "Blueprint", l: 0.6, c: 0.12, hues: { kick: 245, snareClap: 245, hats: 245, percVox: 245, fx: 245, bass: 245, melodic: 245, melodicLoop: 245, drumPercLoop: 245, other: 245 }, ls: { kick: 0.3, snareClap: 0.56, hats: 0.96, percVox: 0.2, fx: 0.47, bass: 0.07, melodic: 0.66, other: 0.86, drumPercLoop: 0.42, melodicLoop: 0.74 }, accent: "#4aa3ff", surface: 250 },
  // Terminal: green phosphor.
  { id: "terminal", name: "Terminal", l: 0.6, c: 0.15, hues: { kick: 145, snareClap: 145, hats: 145, percVox: 145, fx: 145, bass: 145, melodic: 145, melodicLoop: 145, drumPercLoop: 145, other: 145 }, ls: { kick: 0.3, snareClap: 0.56, hats: 0.96, percVox: 0.2, fx: 0.47, bass: 0.07, melodic: 0.66, other: 0.86, drumPercLoop: 0.42, melodicLoop: 0.74 }, accent: "#3dff7a", surface: 150 },
  // Amber: an old monitor.
  { id: "amber", name: "Amber", l: 0.7, c: 0.14, hues: { kick: 72, snareClap: 72, hats: 72, percVox: 72, fx: 72, bass: 72, melodic: 72, melodicLoop: 72, drumPercLoop: 72, other: 72 }, ls: { kick: 0.3, snareClap: 0.56, hats: 0.96, percVox: 0.2, fx: 0.47, bass: 0.07, melodic: 0.66, other: 0.86, drumPercLoop: 0.42, melodicLoop: 0.74 }, accent: "#ffb000", surface: 75 },
  // Game Boy: four greens.
  { id: "gameboy", name: "Game Boy", l: 0.6, c: 0.12, hues: { kick: 125, snareClap: 125, hats: 125, percVox: 125, fx: 125, bass: 125, melodic: 125, melodicLoop: 125, drumPercLoop: 125, other: 125 }, ls: { kick: 0.3, snareClap: 0.56, hats: 0.96, percVox: 0.2, fx: 0.47, bass: 0.07, melodic: 0.66, other: 0.86, drumPercLoop: 0.42, melodicLoop: 0.74 }, accent: "#9bbc0f", surface: 120 },
  // Slate: cool greys with a blue lamp.
  { id: "slate", name: "Slate", l: 0.58, c: 0.02, hues: { kick: 250, snareClap: 250, hats: 250, percVox: 250, fx: 250, bass: 250, melodic: 250, melodicLoop: 250, drumPercLoop: 250, other: 250 }, ls: { kick: 0.3, snareClap: 0.56, hats: 0.96, percVox: 0.2, fx: 0.47, bass: 0.07, melodic: 0.66, other: 0.86, drumPercLoop: 0.42, melodicLoop: 0.74 }, accent: "#5cc8ff", surface: 250 },
  {
    id: "grayscale",
    name: "Grayscale",
    l: 0.58,
    c: 0,
    ls: { kick: 0.3, snareClap: 0.56, hats: 0.96, percVox: 0.2, fx: 0.47, bass: 0.07, melodic: 0.66, other: 0.86, drumPercLoop: 0.42, melodicLoop: 0.74 },
    accent: "#f2f2ee",
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
    accent: spec.accent,
    surface: spec.surface,
    colors: TONES.map((t) => {
      const r = ROLES[t];
      return oklchToHex(spec.ls?.[t] ?? spec.l + r.dl * spread, spec.c * r.c, spec.hues?.[t] ?? r.h);
    }),
  };
}

/** How many shades a category sits from its tone's base colour (0 = the base itself). */
const SHADE: Partial<Record<CategoryId, number>> = { clap: 1, openHat: 1, cymbal: 2, vox: 1, percLoop: 1 };
/**
 * Organ: the rocker tabs of a 1970s home organ, translucent plastic in smooth runs on a black panel. Drums run from red
 * through orange into yellow (kick, snare and clap along the red end, hats along the yellow end), loops are the greens,
 * and the melodic sounds, bass and the rest run from pink through orchid and indigo to slate. Picked by hand from a
 * photo of the panel and lifted a little, since the photo is underexposed.
 */
const ORGAN: Record<CategoryId, string> = {
  kick: "#DE3B1A",
  snare: "#E2455F",
  clap: "#E86E20",
  closedHat: "#EEBA12",
  openHat: "#E9A20E",
  cymbal: "#F8EBA8",
  vox: "#F0A66E",
  perc: "#2AA79B",
  drumLoop: "#2E9A4B",
  percLoop: "#4DB36E",
  melodic: "#E2919A",
  melodicLoop: "#C88BA2",
  bass: "#57517A",
  fx: "#9A7390",
  other: "#44444E",
};

const organ: Palette = {
  id: "organ",
  name: "Organ",
  accent: "#ff5b24",
  colors: TONES.map((t) => ORGAN[(Object.keys(CATEGORY_TONE) as CategoryId[]).find((c) => CATEGORY_TONE[c] === t && !SHADE[c])!]),
  categories: ORGAN,
};

export const PALETTES: Palette[] = [organ, ...SPECS.map(build)];

export const DEFAULT_PALETTE_ID = "organ";

export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** The palette's base colour for a tone. */
export function toneColor(palette: Palette, tone: ToneId): string {
  return palette.colors[TONES.indexOf(tone)] ?? palette.colors[palette.colors.length - 1];
}

/** OKLCH lightness moved per shade. */
const SHADE_STEP = 0.085;

/** `hex` moved `steps` shades away from its own lightness: lighter when the colour is dark, darker when it is light, keeping its hue. */
export function shade(hex: string, steps: number): string {
  if (steps === 0) return hex;
  const [l, c, h] = hexToOklch(hex);
  return oklchToHex(l < 0.62 ? l + steps * SHADE_STEP : l - steps * SHADE_STEP, c, h);
}

/** `hex` a little darker (the same hue and chroma, `steps` shades down in lightness). */
export function darker(hex: string, steps = 1): string {
  const [l, c, h] = hexToOklch(hex);
  return oklchToHex(Math.max(0, l - steps * SHADE_STEP), c, h);
}

/** A category's pad colour: its tone's base colour, shaded so related sounds (snare and clap) read as family. */
export function colorFor(palette: Palette, category: CategoryId): string {
  if (palette.categories) return palette.categories[category];
  return shade(toneColor(palette, CATEGORY_TONE[category]), SHADE[category] ?? 0);
}


/**
 * The colour of the `i`th chop (or section): the palette's own colours, but taken in an order where each colour is as far as it can be from the one before
 * it (a greedy walk round the colours by their distance in OKLCH, starting from the first), so side-by-side chops never look alike. The same colours repeat
 * in that order for more chops than the palette has.
 */
export function chopColor(colors: readonly string[], i: number): string {
  const n = colors.length;
  if (n <= 2) return colors[((i % n) + n) % n];
  const lab = colors.map((hex) => {
    const [l, c, h] = hexToOklch(hex);
    return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  });
  const dist = (a: number, b: number) => Math.hypot(lab[a][0] - lab[b][0], lab[a][1] - lab[b][1], lab[a][2] - lab[b][2]);
  const order = [0];
  const left = new Set(colors.map((_, k) => k).slice(1));
  while (left.size > 0) {
    const last = order[order.length - 1];
    let best = -1;
    for (const k of left) if (best < 0 || dist(last, k) > dist(last, best)) best = k;
    order.push(best);
    left.delete(best);
  }
  return colors[order[((i % n) + n) % n]];
}
