import type { ExtraDrums } from "../audio/extraDrums";

/** Asked at export: what to do with the drums the finger-drumming layout had no slot for. */
export function ExtraDrumsModal({ count, onChoose, onCancel }: { count: number; onChoose: (mode: ExtraDrums) => void; onCancel: () => void }) {
  return (
    <div className="palette-backdrop" onClick={onCancel}>
      <div className="palette-modal" role="dialog" aria-label="Unused drums" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Unused drums</strong>
          <button onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">
          {count} {count === 1 ? "drum isn't" : "drums aren't"} in the finger drumming layout. Melodic sounds start on page B either way.
        </div>
        <div className="palette-modal__list">
          <button className="menu__button" onClick={() => onChoose("keep")}>
            Keep them on the last page
          </button>
          <button className="menu__button" onClick={() => onChoose("delete")}>
            Delete them
          </button>
        </div>
      </div>
    </div>
  );
}
