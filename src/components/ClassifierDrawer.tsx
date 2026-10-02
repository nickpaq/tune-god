import { CATEGORIES } from "../audio/classify";
import type { CategoryId } from "../audio/classify";
import { textColorOn, colorFor, type Palette } from "../audio/palettes";
import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

/**
 * Drawer that opens under the key bar and lists every sound in the project with a play button, a delete button
 * and one coloured button per sound type, laid out as a 5 x 3 grid. All the buttons are equally bright until a type
 * is chosen; the chosen type then glows and the rest dim. Each button sits on its type's pad colour, so snare and clap,
 * both hats, and vox and perc show as neighbouring shades of one tone while kick stands apart.
 */
export function ClassifierDrawer({
  pads,
  palette,
  audioOf,
  onClassify,
  onDelete,
}: {
  /** Every real sound, in pad order. */
  pads: Pad[];
  palette: Palette;
  /** The audio to preview: the raw sound, or its normalized version once Normalize now has run. */
  audioOf: (pad: Pad) => Float32Array[];
  onClassify: (pad: Pad, category: CategoryId) => void;
  onDelete: (pad: Pad) => void;
}) {
  const preview = useSoundPreview();
  return (
    <div className="drawer drawer--types" role="region" aria-label="Sound classifier">
      <div className="drawer__hint">Play a sound, then tap what it is.</div>
      <div className="drawer__list">
        {pads.length === 0 && <div className="drawer__hint">No sounds in this project.</div>}
        {pads.map((pad) => (
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
            <div className={`sound-row__types${pad.category ? " sound-row__types--chosen" : ""}`}>
              {CATEGORIES.map((c) => {
                const bg = colorFor(palette, c.id);
                return (
                  <button
                    key={c.id}
                    className={`type-button${pad.category === c.id ? " type-button--on" : ""}`}
                    style={{ background: bg, color: textColorOn(bg), ["--c" as string]: bg }}
                    aria-pressed={pad.category === c.id}
                    aria-label={c.label}
                    onClick={() => onClassify(pad, c.id)}
                  >
                    {c.short}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
