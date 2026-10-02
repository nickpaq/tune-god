import { CATEGORIES } from "../audio/classify";
import { PALETTES, colorFor } from "../audio/palettes";
import { PLATES } from "./typePlates";

/** Every sound type in the order the sound type drawer lays them out: five columns, drums on the top two rows. */
const TYPES = PLATES.flatMap((plate) => plate.ids);
const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

/**
 * Centered popup listing every palette. Each one is previewed as the sound type drawer's 5 x 3 grid, so you see each
 * colour where it will land; tap one to choose it.
 */
export function PalettePicker({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette-modal"
        role="dialog"
        aria-label="Choose color palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-modal__head">
          <strong>Color palette</strong>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__list">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              className={`palette-row${p.id === selectedId ? " palette-row--selected" : ""}`}
              aria-pressed={p.id === selectedId}
              onClick={() => {
                onSelect(p.id);
                onClose();
              }}
            >
              <span className="palette-row__name">{p.name}</span>
              <span className="palette-row__swatches">
                {TYPES.map((id) => (
                  <span key={id} title={LABEL[id]} style={{ background: colorFor(p, id) }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
