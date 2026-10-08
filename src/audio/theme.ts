// A colour scheme (palettes.ts) applied to the whole app: the lamp colour (lit keys and switches, the primary key, knobs, the menu's highlights) and a faint
// tint on the chassis, keycaps and menu. Pad, type and chop colours come from the scheme's colours directly (`colorFor`, `chopColor`); this sets the CSS
// custom properties the rest of the interface reads. Graphite grey (index.css) is the scheme with no surface hue.
import { hexToOklch, oklchToHex, type Palette } from "./palettes";

/** The greys of index.css the surface tint is applied to, with their Graphite values. */
const SURFACES: Record<string, string> = {
  "--stage": "#1a1b1d",
  "--chassis1": "#2a2b2e",
  "--chassis2": "#222326",
  "--hi": "#3a3c40",
  "--edge": "#121314",
  "--well": "#18191b",
  "--btn": "#3c3e43",
  "--key": "#3c3e43",
  "--key-hi": "#4a4c52",
  "--key-edge": "#141517",
  "--led-off": "#3a3b40",
  "--seam-d": "#121314",
  "--seam-l": "#3a3c40",
  "--ink": "#dcd8cc",
  "--ink3": "#9a968b",
  "--key-ink": "#dcd8cc",
};

/** How coloured the tinted greys are (OKLCH chroma): the dark surfaces a little, the light text barely. */
const SURFACE_CHROMA = 0.022;
const INK_CHROMA = 0.012;

export interface StyleTarget {
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): string };
}

/** The text colour that reads on a lamp colour: white, or near black on a light accent. */
export function accentInk(accent: string): string {
  return hexToOklch(accent)[0] > 0.78 ? "#141517" : "#ffffff";
}

/** Every property a scheme sets, as name and value (a null value means the Graphite default). */
export function schemeProperties(palette: Palette): Record<string, string | null> {
  const [l, c, h] = hexToOklch(palette.accent);
  const out: Record<string, string | null> = {
    "--accent": palette.accent,
    "--accent-ink": accentInk(palette.accent),
    // the shadow edge under the primary key
    "--accent-edge": oklchToHex(Math.max(0, l - 0.17), c, h),
  };
  for (const [name, hex] of Object.entries(SURFACES)) {
    if (palette.surface === undefined) {
      out[name] = null;
      continue;
    }
    const [sl] = hexToOklch(hex);
    out[name] = oklchToHex(sl, sl > 0.6 ? INK_CHROMA : SURFACE_CHROMA, palette.surface);
  }
  return out;
}

/** Applies a scheme to an element (the document's root). */
export function applyScheme(palette: Palette, root: StyleTarget): void {
  for (const [name, value] of Object.entries(schemeProperties(palette))) {
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}
