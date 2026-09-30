import { CATEGORIES, categoryIndex, type CategoryId } from "./classify";

export interface Palette {
  id: string;
  name: string;
  /** One hex per category, in CATEGORIES order: kick, snare, hat, perc, bass, melodic, vocal, fx, other. */
  colors: string[];
}

export const PALETTES: Palette[] = [
  { id: "koala", name: "Koala", colors: ["#FF586F", "#EC7131", "#FFE658", "#FFA53D", "#302383", "#01D1FD", "#7AE582", "#C77DFF", "#D9D9D9"] },
  { id: "sunset", name: "Sunset", colors: ["#FF5E5B", "#FF9F1C", "#FFD166", "#F9C784", "#8C2F39", "#F28482", "#B5838D", "#E5989B", "#F7EDE2"] },
  { id: "ocean", name: "Ocean", colors: ["#0077B6", "#00B4D8", "#CAF0F8", "#5FA8D3", "#03045E", "#48CAE4", "#1B98E0", "#7FB7BE", "#90A4B8"] },
  { id: "forest", name: "Forest", colors: ["#2D6A4F", "#74C69D", "#D8F3DC", "#95D5B2", "#1B4332", "#52B788", "#B7E4C7", "#40916C", "#A3B18A"] },
  { id: "candy", name: "Candy", colors: ["#FF70A6", "#FF9770", "#FFD670", "#FFB3C6", "#9B5DE5", "#70D6FF", "#9EE493", "#B8C0FF", "#CDB4DB"] },
  { id: "vaporwave", name: "Vaporwave", colors: ["#FF71CE", "#B967FF", "#05FFA1", "#FF9CEE", "#3B1F8C", "#01CDFE", "#94D0FF", "#FFCB77", "#FFFB96"] },
  { id: "autumn", name: "Autumn", colors: ["#D94801", "#F16913", "#FDAE6B", "#E9A66C", "#7F2704", "#FDD0A2", "#C1502E", "#B08968", "#A68A64"] },
  { id: "berry", name: "Berry", colors: ["#DA4EA2", "#FF85C0", "#FFD6EC", "#C77DFF", "#4A0D67", "#8E2DE2", "#F4A6D7", "#6A0572", "#B39DDB"] },
  { id: "mint-coral", name: "Mint & Coral", colors: ["#EF476F", "#FFC43D", "#FFE29A", "#FF8A5B", "#1B9AAA", "#06D6A0", "#5EB1BF", "#FFA69E", "#073B4C"] },
  { id: "desert", name: "Desert", colors: ["#9A031E", "#E36414", "#FB8B24", "#CC5803", "#5F0F40", "#F4A261", "#BC4749", "#C29B7C", "#E9D8A6"] },
  { id: "arctic", name: "Arctic", colors: ["#3D5A80", "#98C1D9", "#E0FBFC", "#5C7AA6", "#293241", "#EE6C4D", "#B8DBD9", "#F4B393", "#8D99AE"] },
  { id: "neon", name: "Neon", colors: ["#F72585", "#B5179E", "#4CC9F0", "#7209B7", "#3A0CA3", "#4361EE", "#FF9E00", "#00F5D4", "#C6FF3D"] },
  { id: "earth", name: "Earth", colors: ["#BC6C25", "#DDA15E", "#FEFAE0", "#99582A", "#283618", "#606C38", "#CCD5AE", "#6B705C", "#A98467"] },
  { id: "pastel", name: "Pastel", colors: ["#FFADAD", "#FFD6A5", "#FDFFB6", "#FFC6FF", "#BDB2FF", "#A0C4FF", "#9BF6FF", "#FFE5B4", "#CAFFBF"] },
  { id: "lavender", name: "Lavender", colors: ["#9F86C0", "#E0B1CB", "#F3E1F0", "#BDB2FF", "#231942", "#5E548E", "#D4B3E8", "#7A6F9B", "#BE95C4"] },
  { id: "retro", name: "Retro", colors: ["#E76F51", "#F4A261", "#E9C46A", "#F28482", "#264653", "#2A9D8F", "#84A59D", "#F6BD60", "#8AB17D"] },
  { id: "grayscale", name: "Grayscale", colors: ["#333333", "#666666", "#F2F2F2", "#4D4D4D", "#111111", "#999999", "#B3B3B3", "#808080", "#CCCCCC"] },
];

export const DEFAULT_PALETTE_ID = "koala";

export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function colorFor(palette: Palette, category: CategoryId): string {
  return palette.colors[categoryIndex(category)] ?? palette.colors[CATEGORIES.length - 1];
}

/** Black or white, whichever reads better over `hex`. */
export function textColorOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000" : "#fff";
}
