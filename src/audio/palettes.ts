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

/**
 * A scheme picked at random from a theme, and unique because of it: each of its ten tones gets its own hue (from the theme's hue ranges), lightness and
 * chroma, drawn from a seeded generator, so no two schemes share a structure and none is another with a hue turned. Draws that break the rules are thrown
 * away and drawn again (the same seed always ends in the same scheme): every type is told apart from every other, and snares, cymbals and perc, the sounds
 * most often side by side, are well apart. The tones are shuffled before they are drawn so none has first pick of the colours.
 */
export interface SeedSpec {
  id: string;
  name: string;
  seed: number;
  /** The hue ranges (degrees, start to end round the wheel) the tones are drawn from. */
  hues: [number, number][];
  /** Lightness and chroma ranges the tones are drawn from. */
  l: [number, number];
  c: [number, number];
  accent: string;
  surface?: number;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const labOf = (hex: string) => {
  const [l, c, h] = hexToOklch(hex);
  return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
};
const apart = (a: string, b: string) => {
  const x = labOf(a);
  const y = labOf(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const ALL_CATEGORIES = Object.keys(CATEGORY_TONE) as CategoryId[];

/** Whether a palette keeps every type apart from every other (0.034) and snares, cymbals and perc well apart (0.15, 0.15 and 0.11). */
export function keepsRules(p: Palette): boolean {
  const colors = ALL_CATEGORIES.map((c) => colorFor(p, c));
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) if (apart(colors[i], colors[j]) < 0.034) return false;
  const [snare, cymbal, perc] = [colorFor(p, "snare"), colorFor(p, "cymbal"), colorFor(p, "perc")];
  return apart(snare, cymbal) > 0.15 && apart(snare, perc) > 0.15 && apart(cymbal, perc) > 0.11;
}

/** How far a palette is over the rules (1 = just keeping them, more = comfortably): the smallest of each distance over the one it must reach. */
export function ruleMargin(p: Palette): number {
  const colors = ALL_CATEGORIES.map((c) => colorFor(p, c));
  let min = 9;
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) min = Math.min(min, apart(colors[i], colors[j]));
  const [snare, cymbal, perc] = [colorFor(p, "snare"), colorFor(p, "cymbal"), colorFor(p, "perc")];
  return Math.min(min / 0.034, apart(snare, cymbal) / 0.15, apart(snare, perc) / 0.15, apart(cymbal, perc) / 0.11);
}

export function buildSeeded(spec: SeedSpec): Palette {
  const widths = spec.hues.map(([a, b]) => ((b - a + 360) % 360) || 360);
  const total = widths.reduce((t, w) => t + w, 0);
  let last: Palette | null = null;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const rnd = mulberry32(spec.seed * 7919 + attempt);
    const colors: string[] = [];
    // The tones are drawn in a shuffled order.
    const order = TONES.map((_, i) => i).sort(() => rnd() - 0.5);
    for (const i of order) {
      if (TONES[i] === "other") {
        colors[i] = oklchToHex(spec.l[0] + (spec.l[1] - spec.l[0]) * 0.55, 0.02, spec.hues[0][0]);
        continue;
      }
      let pick = rnd() * total;
      let r = 0;
      while (r < widths.length - 1 && pick > widths[r]) pick -= widths[r++];
      const hue = (spec.hues[r][0] + (pick / widths[r]) * widths[r]) % 360;
      colors[i] = oklchToHex(spec.l[0] + rnd() * (spec.l[1] - spec.l[0]), spec.c[0] + rnd() * (spec.c[1] - spec.c[0]), hue);
    }
    last = { id: spec.id, name: spec.name, accent: spec.accent, surface: spec.surface, colors };
    if (keepsRules(last)) return last;
  }
  return last!;
}

/**
 * Schemes taken from palettes picked on coolors.co: the palette's own colours (five and six colour ones are extended to ten with tints and shades of
 * themselves, kept apart from the rest), assigned to the ten tones by the arrangement that keeps the rules best (every type told apart, snares, cymbals and
 * perc well apart, the quietest colour for Other) and nudged a little where a palette could not reach them as it was. Worked out once, offline, and kept as data.
 */
export const CURATED: Palette[] = [
  { id: "golden-peachy-glow", name: "Golden Peachy Glow", accent: "#DB7868", surface: 30, colors: ["#6D4049", "#CBCAA5", "#8A9473", "#AD5729", "#442F32", "#F89B6D", "#FAE1AB", "#22100F", "#8B5F72", "#D67363"] },
  { id: "soft-pink-delight", name: "Soft Pink Delight", accent: "#E66E6D", surface: 22, colors: ["#BE558B", "#C2A9AA", "#B78CA4", "#C95455", "#A73F77", "#EC7592", "#F093AB", "#FAE3EA", "#F5B4C5", "#F7C4D2"] },
  { id: "ocean-sunset", name: "Ocean Sunset", accent: "#E76F5C", surface: 31, colors: ["#E49E3A", "#28606F", "#428F92", "#E8D9AC", "#8E2A2D", "#9F2D1E", "#A1D0BE", "#05131A", "#BB6926", "#AD471D"] },
  { id: "dusty-teal-ember", name: "Dusty Teal Ember", accent: "#DC7387", surface: 9, colors: ["#D8A150", "#501412", "#FCF2B8", "#CE677B", "#3E5C68", "#933330", "#768FA2", "#0A2D32", "#907200", "#FFC190"] },
  { id: "fiery-ocean", name: "Fiery Ocean", accent: "#EF665F", surface: 26, colors: ["#153149", "#FAF0D7", "#31000B", "#ED6481", "#B02A2B", "#B8D0FB", "#6D120D", "#C4B39F", "#3C6578", "#759BBD"] },
  { id: "pastel-dreamland-adventure", name: "Pastel Dreamland Adventure", accent: "#FBACCC", surface: 354, colors: ["#F6CADF", "#C5DFFB", "#669BB9", "#D48E98", "#94A8D7", "#F5B0CB", "#987898", "#FFE8EA", "#C8B2D9", "#A9D0FA"] },
  { id: "autumn-harvest", name: "Autumn Harvest", accent: "#CD7E8C", surface: 9, colors: ["#8F5C37", "#CBC68F", "#894150", "#31000F", "#FCE5B0", "#674207", "#B67863", "#3F281B", "#B49660", "#682322"] },
  { id: "refreshing-summer-fun", name: "Refreshing Summer Fun", accent: "#E67247", surface: 40, colors: ["#EE8933", "#123045", "#996300", "#4A9CBB", "#F5B942", "#D05E32", "#A48B00", "#FFEAD8", "#9DC9E3", "#006875"] },
  { id: "sage-linen", name: "Sage Linen", accent: "#CB8560", surface: 48, colors: ["#EEF6C8", "#DBDFBC", "#AC7C67", "#D49E72", "#F2E3C9", "#F6C1A4", "#8A7041", "#F8F0E1", "#8C9E83", "#A3B297"] },
  { id: "summer-sunset-beach", name: "Summer Sunset Beach Palette", accent: "#F5614F", surface: 30, colors: ["#B92F24", "#14336B", "#5A0F11", "#A9CDE0", "#3267A6", "#5890C6", "#DD4B3B", "#F8DFD6", "#E59A7E", "#E37257"] },
  { id: "sunshine-fiesta-fun", name: "Sunshine Fiesta Fun", accent: "#E67791", surface: 6, colors: ["#E8BCCA", "#F7CCB7", "#E67791", "#659877", "#97D6C0", "#B8F6E1", "#E59272", "#425249", "#DC7355", "#F1BF4F"] },
  { id: "pastel-dreamy-hues", name: "Pastel Dreamy Hues", accent: "#FED4FF", surface: 326, colors: ["#E4D9E3", "#FFF0D9", "#FAC3C8", "#E6B1CF", "#D9F8E9", "#C6E0E5", "#EFF0FF", "#E9E8E0", "#CDD4F2", "#DFE4FF"] },
  { id: "soft-pastels", name: "Soft Pastels", accent: "#AB87C6", surface: 310, colors: ["#B6C4FE", "#BEB4FD", "#C59AB6", "#708DC0", "#9D7BB6", "#BFD5FF", "#E2C8FB", "#E3F0FF", "#F8D5FB", "#8AA5D6"] },
  { id: "soft-rainbow", name: "Soft Rainbow", accent: "#CFB5FA", surface: 302, colors: ["#EBC4E5", "#C8F9C4", "#A1D8F3", "#CDB8F0", "#A9C0EF", "#AAF3DF", "#F8D1D5", "#F9E3D0", "#A4E9F2", "#FBF6CD"] },
  { id: "pastel-dreamland", name: "Pastel Dreamland", accent: "#D6A6FB", surface: 310, colors: ["#C0ABE3", "#FFE1F6", "#CE96E7", "#D4A8FF", "#EBD1FF", "#D1D0F5", "#E6BFFF", "#CCE5FD", "#D5B4F3", "#CDF9FD"] },
  { id: "subtle-pastel-hues", name: "Subtle Pastel Hues", accent: "#FFD7EC", surface: 345, colors: ["#EAD8E9", "#FDF2EA", "#FEDFDE", "#FFABDF", "#E0EDE5", "#C5E0E4", "#E8EBFF", "#F8EBCA", "#D4DEFF", "#CAD0F0"] },
  { id: "peachy-sunrise", name: "Peachy Sunrise", accent: "#E6698A", surface: 6, colors: ["#B8FBD8", "#99DBC8", "#5AA19D", "#AD355A", "#C7532D", "#B5707B", "#EF7070", "#FFFFFF", "#F2A9A1", "#FFD6DB"] },
  { id: "soft-pastel-shades", name: "Soft Pastel Shades", accent: "#83C3F8", surface: 245, colors: ["#F4D1E0", "#FFDFD3", "#FDF1E9", "#91C5F5", "#C1D3E5", "#F6E6EA", "#CEDEF5", "#F5EBD3", "#DFE8E5", "#CADCDC"] },
  { id: "peachy-delight", name: "Peachy Delight", accent: "#D4798B", surface: 8, colors: ["#EFE8B7", "#F5C5AA", "#B07B43", "#B35C6E", "#F2958E", "#C77369", "#BFC899", "#90B295", "#F3AD86", "#D5F1C6"] },
  { id: "cotton-candy-mist", name: "Cotton Candy Mist", accent: "#FFBDC4", surface: 12, colors: ["#EAE9E2", "#FEF2CB", "#DDD3CD", "#CEBDDE", "#F1C4C8", "#F3CCE5", "#FADBCA", "#CDC7C1", "#CBE3DC", "#C7DBEE"] },
  { id: "sun-kissed-autumn-fields", name: "Sun-kissed Autumn Fields", accent: "#DD785A", surface: 37, colors: ["#2F4858", "#031A28", "#E5C46F", "#82D3D5", "#3E7270", "#4E9B8E", "#9E3A3E", "#FFE9E0", "#DA7557", "#E9A56A"] },
  { id: "golden-sun-glow", name: "Golden Sun Glow", accent: "#F6CC76", surface: 84, colors: ["#C58E67", "#905540", "#F0DCAB", "#F6CC76", "#9A9A7B", "#EFAC94", "#777B64", "#4A4631", "#957A68", "#B4BFA0"] },
  { id: "mysterious-night-sky", name: "Mysterious Night Sky", accent: "#A08BCE", surface: 298, colors: ["#221E32", "#232559", "#49485F", "#5D5074", "#75587C", "#A88BA2", "#7E86A0", "#2B273C", "#04092D", "#93768D"] },
  { id: "pastel-rainbow", name: "Pastel Rainbow", accent: "#C37CB5", surface: 334, colors: ["#AC679F", "#FAF3C3", "#BA8F83", "#77A5B4", "#F6C6C4", "#E0C4F5", "#B4BC8F", "#D6F2E1", "#B5DCF5", "#F29BC4"] },
  { id: "royal-purple-majesty", name: "Royal Purple Majesty", accent: "#F36260", surface: 24, colors: ["#E55555", "#402779", "#5A63B8", "#FFA8B8", "#2E176B", "#D972B3", "#240852", "#2F001A", "#5D1650", "#A53864"] },
  { id: "bubblegum-beach-sunset", name: "Bubblegum Beach Sunset", accent: "#EE6384", surface: 8, colors: ["#B1282E", "#61B59E", "#B790A7", "#EE6384", "#F7C8D6", "#F193AA", "#90D1BF", "#C5EDE3", "#AE5E88", "#397C58"] },
  { id: "fiery-ocean-sunset", name: "Fiery Ocean Sunset", accent: "#F3625D", surface: 25, colors: ["#EA632B", "#002C35", "#E98932", "#88D3E6", "#275F61", "#387F80", "#4C9CA0", "#FFEADB", "#AD1923", "#EFAF50"] },
  { id: "cozy-autumn-vibes", name: "Cozy Autumn Vibes", accent: "#CB8B5D", surface: 56, colors: ["#777B64", "#3D3B27", "#F0DCAB", "#905540", "#957A68", "#5D674B", "#9A9A7B", "#FFE9E3", "#C2A695", "#C58E67"] },
  { id: "electric-rainbow-burst", name: "Electric Rainbow Burst", accent: "#AA76FF", surface: 299, colors: ["#D471FF", "#BEFA4B", "#EF8434", "#8A15F5", "#EA3570", "#FADD4B", "#5D007A", "#DCEBFF", "#A0001D", "#54BAFA"] },
  { id: "chocolate-chip-cookie", name: "Chocolate Chip Cookie", accent: "#CE826C", surface: 37, colors: ["#A3A087", "#EEA699", "#642427", "#344431", "#451D00", "#E2CFC0", "#884834", "#F4EDE4", "#6C755C", "#AF7355"] },
  { id: "candy-floss-delight", name: "Candy Floss Delight", accent: "#E47A70", surface: 27, colors: ["#F5B3B0", "#F5C45E", "#A79419", "#003231", "#A4481F", "#4896A5", "#81CFDF", "#FDF4F1", "#2B636C", "#E47A70"] },
  { id: "summer-sunset-splash", name: "Summer Sunset Splash", accent: "#F0665C", surface: 27, colors: ["#64D6A8", "#A01518", "#F7D277", "#89BCF5", "#3D89B3", "#E88F6F", "#DD5470", "#193B4D", "#B9FFF1", "#499959"] },
];

/** The generated schemes: a theme each (its hues, lightness and chroma) and a seed. */
export const SEEDED: SeedSpec[] = [
  { id: "koala", name: "Koala", seed: 1, hues: [[205, 265], [350, 25]], l: [0.45, 0.82], c: [0.045, 0.11], accent: "#ff6b81", surface: 250 },
  { id: "studio", name: "Studio", seed: 2, hues: [[185, 250], [25, 60]], l: [0.46, 0.8], c: [0.05, 0.11], accent: "#e0a458", surface: 230 },
  { id: "pastel", name: "Pastel", seed: 3, hues: [[0, 360]], l: [0.76, 0.92], c: [0.06, 0.1], accent: "#ff9eb5" },
  { id: "neon", name: "Neon", seed: 4, hues: [[0, 360]], l: [0.62, 0.84], c: [0.2, 0.29], accent: "#b6ff00", surface: 300 },
  { id: "midnight", name: "Midnight", seed: 5, hues: [[235, 305], [335, 360], [75, 100]], l: [0.34, 0.66], c: [0.1, 0.17], accent: "#ffc83d", surface: 265 },
  { id: "sunset", name: "Sunset", seed: 6, hues: [[0, 70], [300, 360], [255, 290]], l: [0.5, 0.82], c: [0.12, 0.2], accent: "#ff7a3d", surface: 30 },
  { id: "ocean", name: "Ocean", seed: 7, hues: [[165, 255], [20, 50]], l: [0.4, 0.85], c: [0.08, 0.15], accent: "#28b6d6", surface: 235 },
  { id: "deepsea", name: "Deep sea", seed: 8, hues: [[170, 270], [330, 350]], l: [0.28, 0.7], c: [0.09, 0.16], accent: "#1fd1c1", surface: 215 },
  { id: "forest", name: "Forest", seed: 9, hues: [[85, 175], [20, 60]], l: [0.3, 0.78], c: [0.08, 0.15], accent: "#6bbf59", surface: 150 },
  { id: "moss", name: "Moss", seed: 10, hues: [[90, 150], [15, 45], [190, 215]], l: [0.35, 0.8], c: [0.07, 0.14], accent: "#9acd32", surface: 125 },
  { id: "tropical", name: "Tropical", seed: 11, hues: [[120, 215], [335, 20], [75, 100]], l: [0.55, 0.85], c: [0.14, 0.22], accent: "#00d1a0", surface: 170 },
  { id: "candy", name: "Candy", seed: 12, hues: [[320, 20], [180, 215], [60, 90]], l: [0.6, 0.9], c: [0.09, 0.17], accent: "#ff5fa8", surface: 345 },
  { id: "blossom", name: "Blossom", seed: 13, hues: [[330, 30], [110, 160]], l: [0.55, 0.92], c: [0.06, 0.12], accent: "#ff8fb1", surface: 350 },
  { id: "lavender", name: "Lavender", seed: 14, hues: [[255, 330], [80, 105]], l: [0.45, 0.9], c: [0.07, 0.14], accent: "#b48cff", surface: 290 },
  { id: "citrus", name: "Citrus", seed: 15, hues: [[15, 125]], l: [0.55, 0.92], c: [0.12, 0.2], accent: "#ffd21f", surface: 100 },
  { id: "desert", name: "Desert", seed: 16, hues: [[15, 85], [200, 230]], l: [0.4, 0.88], c: [0.07, 0.13], accent: "#e69a4a", surface: 60 },
  { id: "rosegold", name: "Rose gold", seed: 17, hues: [[345, 50], [225, 260]], l: [0.45, 0.9], c: [0.06, 0.12], accent: "#e8a190", surface: 20 },
  { id: "volcano", name: "Volcano", seed: 18, hues: [[10, 65], [270, 295]], l: [0.3, 0.78], c: [0.1, 0.19], accent: "#ff4a1c", surface: 25 },
  { id: "aurora", name: "Aurora", seed: 19, hues: [[120, 210], [270, 330]], l: [0.45, 0.88], c: [0.1, 0.19], accent: "#45f0b0", surface: 170 },
  { id: "arctic", name: "Arctic", seed: 20, hues: [[190, 250], [350, 25]], l: [0.5, 0.94], c: [0.05, 0.1], accent: "#7fd4ff", surface: 225 },
  { id: "cyberpunk", name: "Cyberpunk", seed: 21, hues: [[285, 345], [175, 215], [95, 115]], l: [0.45, 0.82], c: [0.18, 0.27], accent: "#ff2bd6", surface: 310 },
  { id: "vaporwave", name: "Vaporwave", seed: 22, hues: [[290, 350], [170, 210]], l: [0.55, 0.9], c: [0.09, 0.16], accent: "#ff71ce", surface: 300 },
  { id: "royal", name: "Royal", seed: 23, hues: [[255, 325], [75, 100], [340, 360]], l: [0.3, 0.7], c: [0.1, 0.18], accent: "#e6b800", surface: 285 },
  { id: "harvest", name: "Harvest", seed: 24, hues: [[20, 110], [330, 350]], l: [0.35, 0.8], c: [0.09, 0.17], accent: "#d9762a", surface: 55 },
  { id: "berry", name: "Berry", seed: 25, hues: [[310, 360], [250, 290], [100, 130]], l: [0.38, 0.8], c: [0.1, 0.18], accent: "#d6336c", surface: 340 },
  { id: "mint", name: "Mint", seed: 26, hues: [[140, 200], [0, 25], [270, 300]], l: [0.5, 0.92], c: [0.07, 0.14], accent: "#4de0b5", surface: 165 },
  { id: "slateorange", name: "Slate & orange", seed: 27, hues: [[225, 260], [30, 55]], l: [0.35, 0.85], c: [0.04, 0.14], accent: "#ff8a3d", surface: 245 },
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

/** OKLCH lightness moved per shade. */
const SHADE_STEP = 0.085;

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

export const PALETTES: Palette[] = [organ, ...CURATED, ...SEEDED.map(buildSeeded), ...SPECS.map(build)];

export const DEFAULT_PALETTE_ID = "organ";

export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** The palette's base colour for a tone. */
export function toneColor(palette: Palette, tone: ToneId): string {
  return palette.colors[TONES.indexOf(tone)] ?? palette.colors[palette.colors.length - 1];
}


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
 * The colour of the `i`th chop (or section): the palette's own colours, but taken in an order where each colour is as far as it can be from the last three
 * before it (a greedy walk round the colours by their distance in OKLCH, starting from the first), so chops near each other never look alike. The same colours repeat
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
  // Each colour taken next is the one furthest from the last three chosen (the nearest of them counts), so a chop differs from the two before it as well as
  // the one before, and the same few colours do not keep coming back together.
  const order = [0];
  const left = new Set(colors.map((_, k) => k).slice(1));
  while (left.size > 0) {
    const recent = order.slice(-3);
    const near = (k: number) => Math.min(...recent.map((r) => dist(r, k)));
    let best = -1;
    for (const k of left) if (best < 0 || near(k) > near(best) + 1e-9) best = k;
    order.push(best);
    left.delete(best);
  }
  return colors[order[((i % n) + n) % n]];
}
