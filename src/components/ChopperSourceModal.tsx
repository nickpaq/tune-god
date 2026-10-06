import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

/** The shortest sample Chopper mode offers (seconds). */
export const CHOPPER_MIN_SECONDS = 10;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** Chopper mode: every sample over 10 seconds in the project, to pick the one to chop. */
export function ChopperSourceModal({ pads, onPick, onCancel }: { pads: Pad[]; onPick: (pad: Pad) => void; onCancel: () => void }) {
  const preview = useSoundPreview();
  return (
    <div className="palette-backdrop" onClick={onCancel}>
      <div className="palette-modal" role="dialog" aria-label="Sample to chop" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Sample to chop</strong>
          <button onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">
          {pads.length === 0 ? `This project has no sample over ${CHOPPER_MIN_SECONDS} seconds.` : `Samples over ${CHOPPER_MIN_SECONDS} seconds in this project. Play one to check, then choose it.`}
        </div>
        <div className="palette-modal__list">
          {pads.map((pad) => (
            <div key={pad.origIndex} className="sound-row">
              <div className="sound-row__head">
                <button
                  className="sound-row__icon"
                  onPointerDown={() => preview.toggle(pad.origIndex, pad.channelData, pad.sampleRate)}
                  aria-label={`${preview.playing === pad.origIndex ? "Stop" : "Play"} ${pad.label || pad.name}`}
                >
                  {preview.playing === pad.origIndex ? "■" : "▶"}
                </button>
                <span className="sound-row__name">{pad.label || pad.name}</span>
                <span className="sound-row__duration">{formatDuration(pad.channelData[0].length / pad.sampleRate)}</span>
                <button
                  className="sound-row__chop"
                  onClick={() => {
                    if (preview.playing === pad.origIndex) preview.stop();
                    onPick(pad);
                  }}
                  aria-label={`Chop ${pad.label || pad.name}`}
                >
                  Chop
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
