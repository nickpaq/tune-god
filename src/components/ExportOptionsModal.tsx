import { useState } from "react";
import { MASTER_STYLES, type MasterStyle } from "../audio/mixPresets";
import type { ExportOptions } from "../audio/exportOptions";
import { exportFileName } from "../audio/exportFileName";

type Flag = Exclude<keyof ExportOptions, "masterStyle">;

/** Asked at every export: what the app may do to the sounds and pads on the way out. The choices are remembered. */
const CHOICES: { key: Flag; label: string; hint: string }[] = [
  { key: "normalize", label: "Apply per-type pad EQ", hint: "A high-pass, mid and high shelf by sound type. Sounds are never made louder or quieter." },
  { key: "colorsAndLabels", label: "Apply colours and labels to pads", hint: "The pad colours and names shown in the app. Off, pads keep what the project gave them." },
  { key: "masterChain", label: "Add the Koala FX master chain", hint: "EQ, drive, compressor, clipper and limiter on the master (replaces effects already there)." },
  { key: "buses", label: "Route to and rename buses", hint: "Kick, Bass, Drums, and Melodic + Chops + FX buses, with the kick clipper and an EQ on the last one." },
  { key: "melodicPatterns", label: "Create patterns for melodic loops", hint: "One pattern per loop at its length, from the last slot back (slots 32 to 17)." },
  { key: "panSpread", label: "Spread hats and melodic sounds in the stereo field", hint: "A random left and right placement, mirrored in pairs." },
  { key: "sidechain", label: "Sidechain the bass and 808s to the kick", hint: "Koala's sidechain on the Bass bus, listening to the Kick bus. Turns on bus routing; sounds are not changed." },
  { key: "chokeGroups", label: "Set choke groups automatically", hint: "Hats, cymbals, drum loops, basses and vocal loops cut each other off by type (six groups). Chops keep group 4." },
];

export interface ExportValues {
  /** The project tempo written to the file (and used in its name). */
  bpm: number;
  /** The A4 reference in Hz the tunings are worked out from. */
  a4: number;
  /** The project's name; the file is named "{name} - {key} - {bpm}bpm.koala". */
  name: string;
}

export function ExportOptionsModal({ initial, values, a4Range, sidechainBlocker, keyText, onShuffle, onExport, onCancel }: { initial: ExportOptions; values: ExportValues; a4Range: { min: number; max: number }; /** Why the sidechain cannot be used now (no kick, or no bass or 808, on the pads); undefined when it can. */ sidechainBlocker?: string; /** The key picked on the piano as it goes in the file name; null when none. */ keyText: string | null; /** A new random name taken from the sounds, or null when there is none. */ onShuffle: () => string | null; onExport: (options: ExportOptions, values: ExportValues) => void; onCancel: () => void }) {
  const [options, setOptions] = useState<ExportOptions>(initial);
  const [bpmText, setBpmText] = useState(String(values.bpm));
  const [a4Text, setA4Text] = useState(String(values.a4));
  const [name, setName] = useState(values.name);
  const bpm = Number(bpmText.replace(",", "."));
  const a4 = Number(a4Text.replace(",", "."));
  const valid = Number.isFinite(bpm) && bpm >= 20 && bpm <= 300 && Number.isFinite(a4) && a4 >= a4Range.min && a4 <= a4Range.max;
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
              <input type="checkbox" checked={options[choice.key] && !(choice.key === "sidechain" && sidechainBlocker)} disabled={choice.key === "sidechain" && !!sidechainBlocker} onChange={(e) => set(choice.key, e.target.checked)} />
              <span>
                <strong>{choice.label}</strong>
                <small>{choice.key === "sidechain" && sidechainBlocker ? sidechainBlocker : choice.hint}</small>
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
        <div className="export-options__values export-options__name">
          <label>
            <span>Project name</span>
            <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
          </label>
          <button type="button" className="menu__button" onClick={() => { const next = onShuffle(); if (next) setName(next); }}>
            Shuffle
          </button>
        </div>
        <small className="export-options__preview">{exportFileName(name, keyText, Number.isFinite(bpm) ? bpm : 0)}</small>
        <div className="export-options__values">
          <label>
            <span>Project BPM</span>
            <input type="number" inputMode="decimal" step="0.01" min={20} max={300} value={bpmText} onChange={(e) => setBpmText(e.target.value)} aria-label="Project BPM" />
          </label>
          <label>
            <span>A4 reference (Hz)</span>
            <input type="number" inputMode="numeric" step="1" min={a4Range.min} max={a4Range.max} value={a4Text} onChange={(e) => setA4Text(e.target.value)} aria-label="A4 reference in hertz" />
          </label>
        </div>
        <div className="export-options__actions">
          <button className="menu__button" onClick={onCancel}>
            Cancel
          </button>
          <button className="menu__button menu__button--primary" disabled={!valid} onClick={() => onExport(options, { bpm: Math.round(bpm * 100) / 100, a4: Math.round(a4), name: name.trim() })}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
