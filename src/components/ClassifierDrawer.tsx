import { CATEGORIES, type CategoryId } from "../audio/classify";
import { colorFor, textColorOn, type Palette } from "../audio/palettes";
import type { Pad } from "./PadPanel";

/**
 * The sound types as a device faceplate: each family of sounds sits on its own plate, tinted to match, and its
 * buttons poke through in shades of that tone. Every plate is as wide as its buttons, and the grid is 5 columns by
 * 3 rows (15 types, nothing left over): drums, percussion, vox and loops fill the top two rows; below them melodic
 * sounds, bass and the odds and ends sit side by side, mirrored around the bass.
 */
const PLATES: { name: string; rows: number; cols: number; ids: CategoryId[] }[][] = [
  [
    {
      name: "Drums",
      rows: 2,
      cols: 5,
      ids: ["kick", "snare", "clap", "closedHat", "openHat", "cymbal", "vox", "perc", "drumLoop", "percLoop"],
    },
  ],
  [
    { name: "Melodic", rows: 1, cols: 2, ids: ["melodic", "melodicLoop"] },
    { name: "Bass", rows: 1, cols: 1, ids: ["bass"] },
    { name: "Other", rows: 1, cols: 2, ids: ["fx", "other"] },
  ],
];

const SHORT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short])) as Record<CategoryId, string>;

/** The average of some hex colours, pulled toward charcoal so a plate reads as the dark surround of its buttons. */
function plateColor(hexes: string[]): string {
  const rgb = [0, 0, 0];
  for (const hex of hexes) {
    const n = parseInt(hex.slice(1), 16);
    rgb[0] += (n >> 16) & 255;
    rgb[1] += (n >> 8) & 255;
    rgb[2] += n & 255;
  }
  const mixed = rgb.map((v) => Math.round((v / hexes.length) * 0.42 + 38 * 0.58));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Drawer that opens over the top of the screen and classifies the selected pad. All buttons are equally bright until
 * a type is chosen; then the chosen one glows and the others dim.
 */
export function ClassifierDrawer({
  pad,
  palette,
  onClassify,
}: {
  /** The selected sound, or null when no pad is selected. */
  pad: Pad | null;
  palette: Palette;
  onClassify: (pad: Pad, category: CategoryId) => void;
}) {
  const chosen = pad?.category;
  return (
    <div className="drawer drawer--types" role="region" aria-label="Sound type">
      <div className="drawer__hint">{pad ? `Pad ${(pad.index % 16) + 1} · ${pad.name}` : "Tap a pad to choose its sound type"}</div>
      <div className={`faceplates${chosen ? " faceplates--chosen" : ""}`}>
        {PLATES.map((row, r) => (
          <div key={r} className="faceplates__row">
            {row.map((plate) => (
              <div
                key={plate.name}
                className="faceplate"
                style={{
                  flex: plate.cols,
                  gridTemplateColumns: `repeat(${plate.cols}, 1fr)`,
                  background: plateColor(plate.ids.map((id) => colorFor(palette, id))),
                }}
                aria-label={plate.name}
              >
                {plate.ids.map((id) => {
                  const bg = colorFor(palette, id);
                  return (
                    <button
                      key={id}
                      className={`type-button${chosen === id ? " type-button--on" : ""}`}
                      style={{ background: bg, color: textColorOn(bg), ["--c" as string]: bg }}
                      disabled={!pad}
                      aria-pressed={chosen === id}
                      aria-label={CATEGORIES.find((c) => c.id === id)?.label}
                      onClick={() => pad && onClassify(pad, id)}
                    >
                      {SHORT[id]}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
