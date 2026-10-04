import { useEffect, useState } from "react";
import { textColorOn } from "../audio/palettes";
import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

/**
 * Hot-swap list for the finger-drumming page: every other drum in the project, each row in its own colour,
 * with a play button and a swap button that trades places with the slot the user tapped.
 */
const PAGE_SIZE = 4;

export function SwapList({
  slotLabel,
  candidates,
  colorOf,
  audioOf,
  onSwap,
}: {
  /** Name of the tapped slot, e.g. "PAD 3". */
  slotLabel: string;
  candidates: Pad[];
  colorOf: (pad: Pad) => string;
  audioOf: (pad: Pad) => Float32Array[];
  onSwap: (pad: Pad) => void;
}) {
  const preview = useSoundPreview();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [slotLabel]);
  const shown = candidates.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  return (
    <div className="swap-list">
      <div className="swap-list__head">
        <strong>{slotLabel}: swap in</strong>
      </div>
      <div className="swap-list__rows">
        {candidates.length === 0 && <div className="swap-list__empty">No other sounds to swap in.</div>}
        {shown.map((pad) => {
          const bg = colorOf(pad);
          const fg = textColorOn(bg);
          return (
            <div key={pad.origIndex} className="swap-row" style={{ background: bg, color: fg }}>
              <button
                className="swap-row__btn"
                onPointerDown={() => preview.toggle(pad.origIndex, audioOf(pad), pad.sampleRate)}
                aria-label={`${preview.playing === pad.origIndex ? "Stop" : "Play"} ${pad.name}`}
              >
                {preview.playing === pad.origIndex ? "■" : "▶"}
              </button>
              <span className="swap-row__name">{pad.name}</span>
              <button
                className="swap-row__btn"
                onClick={() => {
                  preview.stop();
                  onSwap(pad);
                }}
                aria-label={`Swap in ${pad.name}`}
              >
                ↻
              </button>
            </div>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="swap-list__pager">
          <button onClick={() => setPage(at - 1)} disabled={at === 0} aria-label="Previous page">
            ◀
          </button>
          <span>
            {at + 1} / {pages}
          </span>
          <button onClick={() => setPage(at + 1)} disabled={at >= pages - 1} aria-label="Next page">
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
