import { useEffect, useRef } from "react";
import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

const PlayGlyph = () => (
  <svg viewBox="0 0 8 8" aria-hidden="true">
    <path d="M2 1v6l5-3z" />
  </svg>
);
const StopGlyph = () => (
  <svg viewBox="0 0 8 8" aria-hidden="true">
    <path d="M2 2h4v4H2z" />
  </svg>
);
const SwapGlyph = () => (
  <svg viewBox="0 0 8 8" aria-hidden="true">
    <path d="M1 3h5V1l2 2.5L6 6V4H1zM7 5H2v2L0 4.5 2 2" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
  </svg>
);

/**
 * Hot-swap list: the sounds that can take the tapped pad's place, drawn on the OLED like the other screens (no colour
 * coding), one slim row each with the sound's name, a play button and a swap button. The list scrolls on its own.
 */
export function SwapList({
  slotLabel,
  candidates,
  audioOf,
  nameOf,
  onSwap,
  onFavorite,
}: {
  /** Identifies the tapped slot; the list starts from the top again when it changes. */
  slotLabel: string;
  candidates: Pad[];
  audioOf: (pad: Pad) => Float32Array[];
  /** How a sound is named in the list. */
  nameOf: (pad: Pad) => string;
  onSwap: (pad: Pad) => void;
  onFavorite: (pad: Pad, favorite: boolean) => void;
}) {
  const preview = useSoundPreview();
  const rows = useRef<HTMLDivElement>(null);
  // A different pad starts its list from the top, and stops any sound still playing.
  useEffect(() => {
    if (rows.current) rows.current.scrollTop = 0;
    preview.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotLabel]);
  return (
    <div className="swap-list">
      <div className="swap-list__rows" ref={rows}>
        {candidates.length === 0 && <div className="swap-list__empty">No other sounds to swap in</div>}
        {candidates.map((pad) => {
          const name = nameOf(pad);
          return (
          <div key={pad.libraryId ?? pad.origIndex} className="swap-row">
              <span className="swap-row__name" title={pad.name}>
                {name}
              </span>
              <button
                className={`swap-row__btn swap-row__favorite${pad.favorite ? " is-favorite" : ""}`}
                onClick={() => onFavorite(pad, !pad.favorite)}
                aria-label={`${pad.favorite ? "Remove" : "Add"} ${name} ${pad.favorite ? "from" : "to"} favorites`}
                title={pad.favorite ? "Remove favorite" : "Keep on this device and add to hot swap"}
              >{pad.favorite ? "★" : "☆"}</button>
              <button
                className={`swap-row__btn${preview.playing === pad.origIndex ? " swap-row__btn--on" : ""}`}
                onClick={() => preview.toggle(pad.origIndex, audioOf(pad), pad.sampleRate)}
                aria-label={`${preview.playing === pad.origIndex ? "Stop" : "Play"} ${name}`}
              >
                {preview.playing === pad.origIndex ? <StopGlyph /> : <PlayGlyph />}
              </button>
              <button
                className="swap-row__btn"
                onClick={() => {
                  preview.stop();
                  onSwap(pad);
                }}
                aria-label={`Swap in ${name}`}
              >
                <SwapGlyph />
              </button>
            </div>
          );
        })}
      </div>
      {candidates.length > 0 && <div className="swap-list__foot">{candidates.length} sounds</div>}
    </div>
  );
}
