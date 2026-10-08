import { PALETTES, type Palette } from "../audio/palettes";

/**
 * The colour schemes, as a long list: each shows its name, its colours (the ten sound-type tones, in order) and its lamp colour. Tapping one applies it at
 * once to the pads, the sound types, the chops, the lamps and the menu, so the whole interface can be judged behind the list; X closes it.
 */
export function SchemeModal({ currentId, onPick, onClose }: { currentId: string; onPick: (palette: Palette) => void; onClose: () => void }) {
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-modal" role="dialog" aria-label="Colour scheme" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Colour scheme</strong>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">Pads, sound types, chops, lamps and the menu all follow it.</div>
        <div className="palette-modal__list">
          {PALETTES.map((p) => (
            <button key={p.id} className={`scheme-row${p.id === currentId ? " scheme-row--on" : ""}`} aria-pressed={p.id === currentId} onClick={() => onPick(p)}>
              <span className="scheme-row__name">{p.name}</span>
              <span className="scheme-row__swatches" aria-hidden="true">
                {p.colors.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="scheme-row__lamp" style={{ background: p.accent, boxShadow: `0 0 8px ${p.accent}` }} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
