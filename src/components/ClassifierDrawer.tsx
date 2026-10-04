import { CATEGORIES, type CategoryId } from "../audio/classify";
import { colorFor, textColorOn, type Palette } from "../audio/palettes";
import type { Pad } from "./PadPanel";
import { useRef } from "react";
import { PLATES } from "./typePlates";
import { useDrawerDrag } from "./useDrawerDrag";

const SHORT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short])) as Record<CategoryId, string>;

/**
 * Drawer that slides down over the screen and classifies the selected pad. The types are coloured rocker tabs on a
 * black panel, like an organ's; the chosen one latches down and lights up, and the others dim a little.
 */
export function ClassifierDrawer({
  open,
  after,
  pad,
  palette,
  onClassify,
  onClose,
  addPack,
}: {
  open: boolean;
  /** Wait for another drawer to slide shut before opening. */
  after: boolean;
  /** The selected sound, or null when no pad is selected. */
  pad: Pad | null;
  palette: Palette;
  onClassify: (pad: Pad, category: CategoryId) => void;
  onClose: () => void;
  /** The Add pack button: choose another sample pack folder to fill the project's missing slots. */
  addPack: { busy: string; disabled: boolean; onFiles: (files: File[]) => void };
}) {
  const folderInput = useRef<HTMLInputElement>(null);
  const chosen = pad?.category;
  const drag = useDrawerDrag(onClose);
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
      <div className="faceplates">
        {PLATES.map((plate) => (
          <div key={plate.name} className="faceplate" aria-label={plate.name}>
            {plate.ids.map((id) => {
              const c = colorFor(palette, id);
              return (
                <button
                  key={id}
                  className={`type-button${chosen === id ? " type-button--on" : ""}`}
                  style={{ ["--c" as string]: c, color: textColorOn(c) }}
                  disabled={!pad}
                  aria-pressed={chosen === id}
                  aria-label={CATEGORIES.find((cat) => cat.id === id)?.label}
                  onClick={() => pad && onClassify(pad, id)}
                >
                  {SHORT[id]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="drawer__foot">
        <button
          className="tone"
          disabled={addPack.disabled}
          title="Choose another sample pack folder. It only fills slots that are still missing a sound; everything you have stays as it is."
          onClick={() => folderInput.current?.click()}
        >
          {addPack.busy || "Add pack"}
        </button>
        <input
          ref={folderInput}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
          webkitdirectory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) addPack.onFiles(files);
          }}
        />
      </div>
      <button className="drawer__handle" aria-label="Close sound type drawer" {...drag} />
    </div>
  );
}
