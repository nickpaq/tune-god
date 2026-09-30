import { FINGER_LAYOUTS } from "../audio/fingerLayouts";
import { colorFor, textColorOn, type Palette } from "../audio/palettes";

/**
 * Popup listing every finger-drumming layout with a preview of bank A. The preview always shows a
 * full kit (every slot filled), coloured by the current palette, with each slot's sound type as its label.
 */
export function LayoutPicker({
  palette,
  selectedId,
  onSelect,
  onClose,
}: {
  palette: Palette;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-modal" role="dialog" aria-label="Choose finger drumming layout" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Finger drumming layouts</strong>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">Bank A preview, bottom row under your thumbs. Colors follow your palette.</div>
        <div className="palette-modal__list">
          {FINGER_LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              className={`layout-row${layout.id === selectedId ? " palette-row--selected" : ""}`}
              onClick={() => {
                onSelect(layout.id);
                onClose();
              }}
            >
              <span className="layout-row__name">{layout.name}</span>
              <span className="layout-row__desc">{layout.description}</span>
              <span className="layout-row__grid">
                {layout.slots.map((slot, i) => {
                  const bg = colorFor(palette, slot.category);
                  return (
                    <span key={i} style={{ background: bg, color: textColorOn(bg) }}>
                      {slot.label}
                    </span>
                  );
                })}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
