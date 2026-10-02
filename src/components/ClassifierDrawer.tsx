import { CATEGORIES, type CategoryId } from "../audio/classify";
import { colorFor, type Palette } from "../audio/palettes";
import type { Pad } from "./PadPanel";
import { PLATES } from "./typePlates";

const SHORT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short])) as Record<CategoryId, string>;

/**
 * Drawer that opens over the top of the screen and classifies the selected pad. Every light is on until a type is
 * chosen; then the chosen key lights up in its colour and the other lights dim.
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
      {!pad && <div className="drawer__hint">Tap a pad to choose its sound type</div>}
      <div className={`faceplates${chosen ? " faceplates--chosen" : ""}`}>
        {PLATES.map((plate) => (
          <div key={plate.name} className="faceplate" aria-label={plate.name}>
            {plate.ids.map((id) => (
              <button
                key={id}
                className={`type-button${chosen === id ? " type-button--on" : ""}`}
                style={{ ["--c" as string]: colorFor(palette, id) }}
                disabled={!pad}
                aria-pressed={chosen === id}
                aria-label={CATEGORIES.find((c) => c.id === id)?.label}
                onClick={() => pad && onClassify(pad, id)}
              >
                <span className="type-button__led" aria-hidden="true" />
                {SHORT[id]}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
