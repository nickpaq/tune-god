import { useState } from "react";
import { MASTER_STYLES, type MasterStyle } from "../audio/mixPresets";
import type { ExportOptions } from "../audio/exportOptions";

type Flag = Exclude<keyof ExportOptions, "masterStyle">;

/** Asked at every export: what the app may do to the sounds and pads on the way out. The choices are remembered. */
const CHOICES: { key: Flag; label: string; hint: string }[] = [
  { key: "normalize", label: "Normalize and balance sounds", hint: "Perceived loudness: every file peak-normalized, each pad's volume set for its sound type, and per-type pad EQ." },
  { key: "colorsAndLabels", label: "Apply colours and labels to pads", hint: "The pad colours and names shown in the app. Off, pads keep what the project gave them." },
  { key: "masterChain", label: "Add the Koala FX master chain", hint: "EQ, drive, compressor, clipper and limiter on the master (replaces effects already there)." },
  { key: "buses", label: "Route to and rename buses", hint: "Kick, Bass, Drums and Melodic buses, with the kick clipper and melodic EQ." },
  { key: "melodicPatterns", label: "Create patterns for melodic loops", hint: "One pattern per loop at its length, from the last slot back (slots 32 to 17)." },
  { key: "panSpread", label: "Spread hats and melodic sounds in the stereo field", hint: "A random left and right placement, mirrored in pairs." },
  { key: "fade808", label: "Fade 808s in under the kick", hint: "A short fade-in the length of the kick's hit, so the kick comes through (a stand-in for a sidechain)." },
  { key: "chokeGroups", label: "Set choke groups automatically", hint: "Open and closed hats, 808s and basses and melodic loops cut each other off." },
];

export function ExportOptionsModal({ initial, fade808Blocker, onExport, onCancel }: { initial: ExportOptions; /** Why the 808 fade-in cannot be used now (no kick, or no bass or 808, on the pads); undefined when it can. */ fade808Blocker?: string; onExport: (options: ExportOptions) => void; onCancel: () => void }) {
  const [options, setOptions] = useState<ExportOptions>(initial);
  const set = (key: Flag, value: boolean) => setOptions((prev) => ({ ...prev, [key]: value }));
  return (
    <div className="palette-backdrop" onClick={onCancel}>
      <div className="palette-modal export-options" role="dialog" aria-label="Export options" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Export</strong>
          <button onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">Choose what the app does for you. Unchecked, sounds and pads come out as they went in.</div>
        <div className="palette-modal__list">
          {CHOICES.map((choice) => (
            <label key={choice.key} className="export-options__row">
              <input type="checkbox" checked={options[choice.key] && !(choice.key === "fade808" && fade808Blocker)} disabled={choice.key === "fade808" && !!fade808Blocker} onChange={(e) => set(choice.key, e.target.checked)} />
              <span>
                <strong>{choice.label}</strong>
                <small>{choice.key === "fade808" && fade808Blocker ? fade808Blocker : choice.hint}</small>
                {choice.key === "masterChain" && options.masterChain && (
                  <select aria-label="Master chain style" value={options.masterStyle} onChange={(e) => setOptions((prev) => ({ ...prev, masterStyle: e.target.value as MasterStyle }))}>
                    {MASTER_STYLES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="export-options__actions">
          <button className="menu__button" onClick={onCancel}>
            Cancel
          </button>
          <button className="menu__button menu__button--primary" onClick={() => onExport(options)}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
