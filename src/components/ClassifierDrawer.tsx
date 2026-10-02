import { CATEGORIES, type CategoryId } from "../audio/classify";
import { colorFor, type Palette } from "../audio/palettes";
import type { Pad } from "./PadPanel";
import { PLATES } from "./typePlates";

const SHORT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short])) as Record<CategoryId, string>;

/**
 * Drawer that slides down over the screen and classifies the selected pad. Every light is on until a type is chosen;
 * then the chosen key latches down, backlit in its colour, and the other lights dim.
 */
export function ClassifierDrawer({
  open,
  after,
  pad,
  palette,
  onClassify,
  onClose,
}: {
  open: boolean;
  /** Wait for another drawer to slide shut before opening. */
  after: boolean;
  /** The selected sound, or null when no pad is selected. */
  pad: Pad | null;
  palette: Palette;
  onClassify: (pad: Pad, category: CategoryId) => void;
  onClose: () => void;
}) {
  const chosen = pad?.category;
  return (
    <div
      className={`drawer drawer--types${open ? " drawer--open" : ""}${after ? " drawer--after" : ""}`}
      role="region"
      aria-label="Sound type"
      inert={!open}
    >
      <div className="drawer__head">
        <span>Sound type</span>
        <span>{pad ? `Pad ${(pad.index % 16) + 1}` : "Tap a pad"}</span>
      </div>
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
      <button className="drawer__handle" aria-label="Close sound type drawer" onClick={onClose} />
    </div>
  );
}
