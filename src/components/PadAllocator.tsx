import { useMemo, useState } from "react";
import {
  BANK_LETTERS,
  assign,
  chopLimit,
  orderedDestinations,
  overwriteMessage,
  overwrites,
  padName,
  selectAll,
  selectUnused,
  summarize,
  tapPreviews,
  toggle,
  type DestinationPad,
} from "../audio/chopDestinations";
import { haptic } from "../audio/haptics";
import { PADS_PER_BANK } from "../audio/padMoves";

/** A small pixel speaker: the pad holds playable audio. */
function Speaker() {
  const rows = ["..#....", ".##.#..", "####.#.", "####.#.", ".##.#..", "..#...."];
  return (
    <svg className="alloc__speaker" viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}

/**
 * Where the chops go: all four banks as they sit on the pads, any pad selectable. An occupied pad plays its sample on the tap that selects it (and is
 * marked in red, because the sample on it will be replaced); the next tap deselects it quietly. The destinations are assigned in order, Bank A to D.
 */
export function PadAllocator({
  pads,
  chopsMarked,
  patternSlots,
  pattern,
  earlierChop,
  onPreview,
  onConfirm,
  onCancel,
}: {
  pads: readonly DestinationPad[];
  /** Chops marked in the editor. */
  chopsMarked: number;
  /** Koala's free pattern slots (a pattern per chop needs one each). */
  patternSlots: number;
  pattern: "multiple" | "single";
  /** Pads that hold an earlier chop's sections: one chop is kept at a time, so those not chosen again are removed. */
  earlierChop: readonly number[];
  /** Plays the sample on the pad as it is in the project. */
  onPreview: (index: number) => void;
  /** The pads the chops go to, in chronological order. */
  onConfirm: (destinations: number[]) => void;
  onCancel: () => void;
}) {
  const [selection, setSelection] = useState<Set<number>>(() => new Set());
  /** null: All (as many as fit); a number: that many chops. */
  const [custom, setCustom] = useState<number | null>(null);
  /** The occupied pad last tapped, whose warning is spelled out. */
  const [focus, setFocus] = useState<number | null>(null);

  const ordered = useMemo(() => orderedDestinations(pads, selection), [pads, selection]);
  const summary = useMemo(() => summarize(pads, selection), [pads, selection]);
  const limit = chopLimit(ordered.length, chopsMarked, patternSlots, pattern);
  const count = custom === null ? limit.max : Math.min(custom, limit.max);
  const assigned = assign(ordered, count);
  const replaced = overwrites(pads, assigned);

  const tap = (pad: DestinationPad) => {
    if (pad.locked) return;
    if (tapPreviews(selection, pad)) {
      onPreview(pad.index);
      haptic("heavy");
      setFocus(pad.index);
    } else {
      haptic("light");
      if (focus === pad.index) setFocus(null);
    }
    setSelection(toggle(selection, pad));
  };

  const leftover = earlierChop.filter((i) => !assigned.includes(i));
  const go = () => {
    if (count === 0) return;
    const parts = [replaced.length ? overwriteMessage(replaced) : "", leftover.length ? `The earlier chop's other ${leftover.length} pad${leftover.length === 1 ? "" : "s"} (${leftover.map(padName).join(", ")}) will be removed, because one chop is kept at a time.` : ""].filter(Boolean);
    if (parts.length > 0 && !window.confirm(`${parts.join("\n\n")}\n\nReplace them and export?`)) return;
    onConfirm(assigned);
  };

  const focused = focus !== null ? pads[focus] : null;
  const limitText =
    limit.by === "patterns" ? `Koala has room for ${patternSlots} more patterns, so ${limit.max} at most` : limit.by === "chops" ? "all the chops marked" : limit.by === "pads" ? "as many as the pads selected" : "";

  return (
    <div className="palette-backdrop chop-backdrop" onClick={onCancel}>
      <div className="chop alloc" role="dialog" aria-label="Choose the pads for the chops" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>{pattern === "single" ? "One pattern" : "Multiple patterns"} · pads</span>
          <button onClick={onCancel} aria-label="Close">
            X
          </button>
        </div>
        <div className="chop__scroll">
          <div className="alloc__banks">
            {BANK_LETTERS.map((letter, b) => (
              <div key={letter} className="alloc__bank">
                <span className="alloc__label">Bank {letter}</span>
                <div className="alloc__grid">
                  {pads.slice(b * PADS_PER_BANK, (b + 1) * PADS_PER_BANK).map((pad) => {
                    const on = selection.has(pad.index);
                    const warn = on && pad.occupied;
                    return (
                      <button
                        key={pad.index}
                        className={["alloc__pad", on && "alloc__pad--on", pad.occupied && "alloc__pad--occupied", warn && "alloc__pad--warn", pad.locked && "alloc__pad--locked"].filter(Boolean).join(" ")}
                        disabled={pad.locked}
                        aria-pressed={on}
                        aria-label={`${padName(pad.index)}${pad.name ? `, ${pad.name}` : ", empty"}${warn ? ", this sample will be overwritten" : ""}${pad.locked ? ", locked" : ""}`}
                        onClick={() => tap(pad)}
                      >
                        <span className="alloc__num">{(pad.index % PADS_PER_BANK) + 1}</span>
                        {pad.occupied && <Speaker />}
                        {warn && <span className="alloc__warn" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="alloc__focus" data-warn={focused?.occupied && selection.has(focused.index) ? "true" : undefined}>
            {focused && focused.occupied && selection.has(focused.index) ? `${padName(focused.index)}${focused.name ? ` · ${focused.name}` : ""}: This sample will be overwritten.` : "Tap a pad to choose it. Pads with a speaker already hold a sample."}
          </p>

          <div className="chop__row">
            <button className="chop__btn chop__grow" onClick={() => (haptic("light"), setSelection(selectUnused(pads)))}>
              Select All Unused Pads
            </button>
            <button className="chop__btn chop__grow" onClick={() => (haptic("light"), setSelection(selectAll(pads)))}>
              Select All Pads
            </button>
          </div>
          <div className="chop__row">
            <button className="chop__btn chop__grow" disabled={selection.size === 0} onClick={() => (haptic("light"), setSelection(new Set()), setFocus(null))}>
              Clear Selection
            </button>
          </div>

          <p className="alloc__summary">
            Selected: {summary.selected} / {summary.total} pads
            <br />
            Empty: {summary.empty} | Will overwrite: {summary.overwrite}
          </p>

          <div className="chop__row alloc__count">
            <span>Chops</span>
            <button className="chop__btn chop__grow" aria-pressed={custom === null} onClick={() => setCustom(null)}>
              All{custom === null && limit.max > 0 ? ` (${limit.max})` : ""}
            </button>
            <input
              className="alloc__number"
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, limit.max)}
              value={custom === null ? "" : custom}
              placeholder="Custom"
              aria-label="Number of chops"
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                setCustom(e.target.value === "" || !Number.isFinite(n) ? null : Math.max(1, Math.min(n, Math.max(1, limit.max))));
              }}
            />
          </div>
          <p className="alloc__summary">
            {chopsMarked} chop{chopsMarked === 1 ? "" : "s"} marked; {count} will be written{limitText && limit.max < chopsMarked ? ` (${limitText})` : ""}.
          </p>
        </div>
        <button className="chop__go" disabled={count === 0} onClick={go}>
          {count === 0 ? "Select pads" : `Export ${count} chop${count === 1 ? "" : "s"}${replaced.length ? ` · replace ${replaced.length}` : ""}`}
        </button>
      </div>
    </div>
  );
}
