import { CATEGORIES, type CategoryId } from "../audio/classify";
import { textColorOn, colorFor, type Palette } from "../audio/palettes";
import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

/**
 * Lists every sound in the project with a play button, a delete button and one checkbox per sound type.
 * Checking a type classifies the sound (only one can be checked); each checkbox sits on its type's pad colour,
 * so snare and clap, both hats, and vox and perc show as neighbouring shades of one tone while kick stands apart.
 */
export function ClassifierModal({
  pads,
  palette,
  audioOf,
  onClassify,
  onDelete,
  onClose,
}: {
  /** Every real sound, in pad order. */
  pads: Pad[];
  palette: Palette;
  /** The audio to preview: the raw sound, or its normalized version once Normalize now has run. */
  audioOf: (pad: Pad) => Float32Array[];
  onClassify: (pad: Pad, category: CategoryId) => void;
  onDelete: (pad: Pad) => void;
  onClose: () => void;
}) {
  const preview = useSoundPreview();
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-modal" role="dialog" aria-label="Sound classifier" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Sound classifier</strong>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">Play a sound, then tick what it is. Related types are shades of one colour.</div>
        <div className="palette-modal__list">
          {pads.length === 0 && <div className="palette-modal__key">No sounds in this project.</div>}
          {pads.map((pad) => {
            const category = pad.category ?? "other";
            return (
              <div key={pad.origIndex} className="sound-row">
                <div className="sound-row__head">
                  <button
                    className="sound-row__icon"
                    onPointerDown={() => preview.toggle(pad.origIndex, audioOf(pad), pad.sampleRate)}
                    aria-label={`${preview.playing === pad.origIndex ? "Stop" : "Play"} ${pad.name}`}
                  >
                    {preview.playing === pad.origIndex ? "■" : "▶"}
                  </button>
                  <span className="sound-row__name">
                    <span className="sound-row__pad">{pad.index + 1}</span> {pad.name}
                  </span>
                  <button
                    className="sound-row__icon sound-row__icon--delete"
                    onClick={() => {
                      if (preview.playing === pad.origIndex) preview.stop();
                      onDelete(pad);
                    }}
                    aria-label={`Delete ${pad.name}`}
                  >
                    🗑
                  </button>
                </div>
                <div className="sound-row__types">
                  {CATEGORIES.map((c) => {
                    const bg = colorFor(palette, c.id);
                    return (
                      <label key={c.id} style={{ background: bg, color: textColorOn(bg), accentColor: textColorOn(bg) }}>
                        <input
                          type="checkbox"
                          checked={category === c.id}
                          onChange={() => onClassify(pad, c.id)}
                          aria-label={c.label}
                        />
                        <span>{c.short}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
