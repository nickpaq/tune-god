import { FINGER_LAYOUTS } from "../audio/fingerLayouts";
import { colorFor, shade, type Palette } from "../audio/palettes";
import { PadSymbol } from "./PadSymbol";

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
        <div className="palette-modal__key">Bank A preview, bottom row under your thumbs. Colors and symbols follow your palette and pads.</div>
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
                  const c = slot.ghostOf ? shade(colorFor(palette, slot.category), 2) : colorFor(palette, slot.category);
                  // Drawn like the pads themselves: dark rubber with the sound type's symbol, a lit edge in its colour, and the name printed underneath.
                  return (
                    <span key={i} className="mini-slot">
                      <span className="mini-pad" style={{ "--c": c } as React.CSSProperties}>
                        <PadSymbol category={slot.category} />
                      </span>
                      <span className="mini-slot__label">{slot.label}</span>
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
