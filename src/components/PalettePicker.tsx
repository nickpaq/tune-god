import { CATEGORIES } from "../audio/classify";
import { PALETTES } from "../audio/palettes";

/** Centered popup listing every palette as a row of six swatches; tap one to choose it. */
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
        <div className="palette-modal__key">{CATEGORIES.map((c) => c.label).join(" · ")}</div>
        <div className="palette-modal__list">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              className={`palette-row${p.id === selectedId ? " palette-row--selected" : ""}`}
              onClick={() => {
                onSelect(p.id);
                onClose();
              }}
            >
              <span className="palette-row__name">{p.name}</span>
              <span className="palette-row__swatches">
                {p.colors.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
