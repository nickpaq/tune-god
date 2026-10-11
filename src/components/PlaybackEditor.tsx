import { useModalFocus } from "./useModalFocus";
import { useState } from "react";
import { CATEGORIES, type CategoryId } from "../audio/classify";
import { resolvePlayback, type PadPlayback } from "../audio/padSettings";
import type { Pad } from "./PadPanel";

export function PlaybackEditor({
  pad,
  settings,
  onType,
  onPad,
  onClose,
}: {
  pad: Pad | null;
  settings: Partial<Record<CategoryId, PadPlayback>>;
  onType: (category: CategoryId, value: PadPlayback | undefined) => void;
  onPad: (value: PadPlayback | undefined) => void;
  onClose: () => void;
}) {
  const dialog = useModalFocus(onClose);
  const [scope, setScope] = useState<"type" | "pad">(pad ? "pad" : "type");
  const [category, setCategory] = useState<CategoryId>(pad?.category ?? "kick");
  const id = scope === "pad" ? (pad?.category ?? "other") : category;
  const current = resolvePlayback(
    id,
    settings[id],
    scope === "pad" ? pad?.playback : undefined,
    scope === "pad" ? pad?.stretch : undefined,
  );
  const patch = (value: PadPlayback) =>
    scope === "pad"
      ? onPad({ ...pad?.playback, ...value })
      : onType(id, { ...settings[id], ...value });
  return (
    <div className="sample-library-backdrop">
      <section
        ref={dialog}
        className="sample-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playback-title"
      >
        <header className="sample-library__header">
          <h2 id="playback-title">Koala export settings</h2>
          <button onClick={onClose} aria-label="Close export settings">
            ×
          </button>
        </header>
        <p>
          Type defaults apply first, then your Type settings, then saved pad
          controls. Bass one-shots and loops both default to choke group 5.
        </p>
        <div className="library-actions">
          <select
            aria-label="Settings scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as "type" | "pad")}
          >
            <option value="type">Type defaults</option>
            <option value="pad" disabled={!pad}>
              Selected pad
            </option>
          </select>
          {scope === "type" && (
            <select
              aria-label="Sound Type"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as CategoryId)
              }
            >
              {CATEGORIES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {scope === "pad" && <strong>{pad?.name}</strong>}
        <label>
          Bus
          <select
            aria-label="Koala bus"
            value={current.bus ?? -1}
            onChange={(event) => patch({ bus: Number(event.target.value) })}
          >
            <option value={-1}>Main</option>
            {[0, 1, 2, 3].map((bus) => (
              <option key={bus} value={bus}>
                Bus {bus + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="library-pack">
          <input
            type="checkbox"
            checked={current.oneShot ?? false}
            onChange={(event) => patch({ oneShot: event.target.checked })}
          />
          One Shot
        </label>
        <label>
          Choke group
          <input
            aria-label="Choke group"
            type="number"
            min={0}
            max={16}
            value={current.chokeGroup ?? 0}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 0 && value <= 16)
                patch({ chokeGroup: value });
            }}
          />
        </label>
        <label>
          Stretch
          <select
            aria-label="Stretch mode"
            value={current.stretch ?? "off"}
            onChange={(event) =>
              patch({ stretch: event.target.value as PadPlayback["stretch"] })
            }
          >
            {["off", "modern", "retro", "beats", "repitch", "cyclic"].map(
              (mode) => (
                <option key={mode}>{mode}</option>
              ),
            )}
          </select>
        </label>
        <button
          onClick={() =>
            scope === "pad" ? onPad(undefined) : onType(id, undefined)
          }
        >
          Reset overrides
        </button>
      </section>
    </div>
  );
}
