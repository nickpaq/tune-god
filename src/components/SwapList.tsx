import { useEffect, useRef } from "react";
import { cleanSampleName } from "../audio/sampleName";
import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

/**
 * Hot-swap list: the sounds that can take the tapped pad's place, drawn on the LCD like the other screens (no colour
 * coding), one slim row each with the sound's name, a play button and a swap button. The list scrolls on its own.
 */
export function SwapList({
  slotLabel,
  candidates,
  audioOf,
  onSwap,
}: {
  /** Name of the tapped slot, e.g. "PAD 3". */
  slotLabel: string;
  candidates: Pad[];
  audioOf: (pad: Pad) => Float32Array[];
  onSwap: (pad: Pad) => void;
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
      <div className="swap-list__head">
        <strong>{slotLabel}: swap in</strong>
        <span>{candidates.length}</span>
      </div>
      <div className="swap-list__rows" ref={rows}>
        {candidates.length === 0 && <div className="swap-list__empty">No other sounds to swap in.</div>}
        {candidates.map((pad) => {
          const name = cleanSampleName(pad.name);
          return (
            <div key={pad.origIndex} className="swap-row">
              <span className="swap-row__name" title={pad.name}>
                {name}
              </span>
              <button
                className={`swap-row__btn${preview.playing === pad.origIndex ? " swap-row__btn--on" : ""}`}
                onClick={() => preview.toggle(pad.origIndex, audioOf(pad), pad.sampleRate)}
                aria-label={`${preview.playing === pad.origIndex ? "Stop" : "Play"} ${name}`}
              >
                {preview.playing === pad.origIndex ? "■" : "▶"}
              </button>
              <button
                className="swap-row__btn"
                onClick={() => {
                  preview.stop();
                  onSwap(pad);
                }}
                aria-label={`Swap in ${name}`}
              >
                ↻
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
