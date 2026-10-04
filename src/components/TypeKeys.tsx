import { CATEGORIES, type CategoryId } from "../audio/classify";
import { colorFor, type Palette } from "../audio/palettes";
import type { Pad } from "./PadPanel";
import { PLATES } from "./typePlates";

/** What is printed on each key; the long names of the loops and hats don't fit across a fifth of the deck. */
const LEGEND: Record<CategoryId, string> = {
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  closedHat: "Cl hat",
  openHat: "Op hat",
  cymbal: "Cymbal",
  vox: "Vox",
  perc: "Perc",
  drumLoop: "D loop",
  percLoop: "P loop",
  melodic: "Melodic",
  melodicLoop: "M loop",
  bass: "Bass",
  fx: "FX",
  other: "Other",
};

/**
 * The deck in Type mode: the fifteen sound types as keys in five columns, each with a lamp in its palette colour. The
 * chosen type's key is pushed in and its lamp lit; the others' lamps are dim.
 */
export function TypeKeys({ pad, palette, onClassify }: { pad: Pad | null; palette: Palette; onClassify: (pad: Pad, category: CategoryId) => void }) {
  const chosen = pad?.category;
  return (
    <div className="type-keys" role="group" aria-label="Sound type">
      {PLATES.flatMap((plate) => plate.ids).map((id) => {
        const c = colorFor(palette, id);
        return (
          <button
            key={id}
            className={`type-key${chosen === id ? " type-key--on" : ""}`}
            style={{ ["--c" as string]: c }}
            disabled={!pad}
            aria-pressed={chosen === id}
            aria-label={CATEGORIES.find((cat) => cat.id === id)?.label}
            onClick={() => pad && onClassify(pad, id)}
          >
            <span className="type-key__lamp" />
            <span className="type-key__legend">{LEGEND[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
