import { CATEGORY_TONE, TONES, type CategoryId, type ToneId } from "./classify";

export interface Palette {
  id: string;
  name: string;
  /** One hex per base tone, in TONES order: kick, snare and clap, hats, perc and vox, fx, bass, melodic, other, drum and perc loops, melodic loop. */
  colors: string[];
}

export const PALETTES: Palette[] = [
  { id: "koala", name: "Koala", colors: ["#FF586F", "#EC7131", "#FFE658", "#FFA53D", "#C77DFF", "#302383", "#01D1FD", "#D9D9D9", "#01FD2D", "#AB01FD"] },
  { id: "sunset", name: "Sunset", colors: ["#FF5E5B", "#FF9F1C", "#FFD166", "#F9C784", "#E5989B", "#8C2F39", "#F28482", "#F7EDE2", "#1CFF2E", "#1C7CFF"] },
  { id: "ocean", name: "Ocean", colors: ["#0077B6", "#00B4D8", "#CAF0F8", "#5FA8D3", "#7FB7BE", "#03045E", "#48CAE4", "#90A4B8", "#D82400", "#1CB600"] },
  { id: "forest", name: "Forest", colors: ["#2D6A4F", "#74C69D", "#D8F3DC", "#95D5B2", "#40916C", "#1B4332", "#52B788", "#A3B18A", "#8852B7", "#914440"] },
  { id: "candy", name: "Candy", colors: ["#FF70A6", "#FF9770", "#FFD670", "#FFB3C6", "#B8C0FF", "#9B5DE5", "#70D6FF", "#CDB4DB", "#63E55D", "#C0FFB8"] },
  { id: "vaporwave", name: "Vaporwave", colors: ["#FF71CE", "#B967FF", "#05FFA1", "#FF9CEE", "#FFCB77", "#3B1F8C", "#01CDFE", "#FFFB96", "#FF2405", "#63FF05"] },
  { id: "autumn", name: "Autumn", colors: ["#D94801", "#F16913", "#FDAE6B", "#E9A66C", "#B08968", "#7F2704", "#FDD0A2", "#A68A64", "#0126D9", "#13F1D8"] },
  { id: "berry", name: "Berry", colors: ["#DA4EA2", "#FF85C0", "#FFD6EC", "#C77DFF", "#6A0572", "#4A0D67", "#8E2DE2", "#B39DDB", "#2DE234", "#DCE22D"] },
  { id: "mint-coral", name: "Mint & Coral", colors: ["#EF476F", "#FFC43D", "#FFE29A", "#FF8A5B", "#FFA69E", "#1B9AAA", "#06D6A0", "#073B4C", "#3CD606", "#3806D6"] },
  { id: "desert", name: "Desert", colors: ["#9A031E", "#E36414", "#FB8B24", "#CC5803", "#C29B7C", "#5F0F40", "#F4A261", "#E9D8A6", "#12CC03", "#24FBF6"] },
  { id: "arctic", name: "Arctic", colors: ["#3D5A80", "#98C1D9", "#E0FBFC", "#5C7AA6", "#F4B393", "#293241", "#EE6C4D", "#8D99AE", "#7EEE4D", "#BD4DEE"] },
  { id: "neon", name: "Neon", colors: ["#F72585", "#B5179E", "#4CC9F0", "#7209B7", "#00F5D4", "#3A0CA3", "#4361EE", "#C6FF3D", "#09B71B", "#B57D17"] },
  { id: "earth", name: "Earth", colors: ["#BC6C25", "#DDA15E", "#FEFAE0", "#99582A", "#6B705C", "#283618", "#606C38", "#A98467", "#5ED9DD", "#2529BC"] },
  { id: "pastel", name: "Pastel", colors: ["#FFADAD", "#FFD6A5", "#FDFFB6", "#FFC6FF", "#FFE5B4", "#BDB2FF", "#A0C4FF", "#CAFFBF", "#A5FBFF", "#FFA0F4"] },
  { id: "lavender", name: "Lavender", colors: ["#9F86C0", "#E0B1CB", "#F3E1F0", "#BDB2FF", "#7A6F9B", "#231942", "#5E548E", "#BE95C4", "#8AC086", "#B2FFBD"] },
  { id: "retro", name: "Retro", colors: ["#E76F51", "#F4A261", "#E9C46A", "#F28482", "#F6BD60", "#264653", "#2A9D8F", "#8AB17D", "#7260F6", "#61F4EC"] },
  { id: "grayscale", name: "Grayscale", colors: ["#333333", "#666666", "#F2F2F2", "#4D4D4D", "#808080", "#111111", "#999999", "#CCCCCC", "#333333", "#333333"] },
];

export const DEFAULT_PALETTE_ID = "koala";

export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** The palette's base colour for a tone (what the classifier shows behind a category's checkbox). */
export function toneColor(palette: Palette, tone: ToneId): string {
  return palette.colors[TONES.indexOf(tone)] ?? palette.colors[palette.colors.length - 1];
}

/** How far each category sits from its tone's base colour: +1 a shade lighter, -1 a shade darker. */
const SHADE: Partial<Record<CategoryId, number>> = { clap: -1, openHat: 1, vox: 1, percLoop: 1 };
/** Lightness moved per shade step (HSL lightness runs 0 to 1). */
const SHADE_STEP = 0.11;

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** `hex` moved `steps` shades lighter (negative: darker), going the other way (twice as far, so it stays distinct from a sibling that did not flip) when it would run out of range. */
export function shade(hex: string, steps: number): string {
  if (steps === 0) return hex;
  const [h, s, l] = toHsl(hex);
  let next = l + steps * SHADE_STEP;
  if (next > 0.93 || next < 0.1) next = l - steps * SHADE_STEP * 2;
  return fromHsl(h, s, Math.max(0, Math.min(1, next)));
}

/** A category's pad colour: its tone's base colour, shaded so related sounds (kick, snare, clap) read as family. */
export function colorFor(palette: Palette, category: CategoryId): string {
  return shade(toneColor(palette, CATEGORY_TONE[category]), SHADE[category] ?? 0);
}

/** Black or white, whichever reads better over `hex`. */
export function textColorOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000" : "#fff";
}
