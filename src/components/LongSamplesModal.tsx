import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** Shown after importing a project that holds absurdly long samples (they make export very slow): play them, delete them, or keep them all. */
export function LongSamplesModal({
  pads,
  maxSeconds,
  onDelete,
  onClose,
}: {
  /** The long sounds still in the project. */
  pads: Pad[];
  maxSeconds: number;
  onDelete: (pad: Pad) => void;
  onClose: () => void;
}) {
  const preview = useSoundPreview();
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-modal" role="dialog" aria-label="Very long samples" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Very long samples</strong>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">
          {pads.length === 1 ? "This sample is" : "These samples are"} longer than {maxSeconds} seconds, which can make export very slow or fail. Play{" "}
          {pads.length === 1 ? "it" : "them"} to check, delete what you don't need, or keep everything.
        </div>
        <div className="palette-modal__list">
          {pads.map((pad) => (
            <div key={pad.origIndex} className="sound-row">
              <div className="sound-row__head">
                <button
                  className="sound-row__icon"
                  onClick={() => preview.toggle(pad.origIndex, pad.channelData, pad.sampleRate)}
                  aria-label={`${preview.playing === pad.origIndex ? "Stop" : "Play"} ${pad.name}`}
                >
                  {preview.playing === pad.origIndex ? "■" : "▶"}
                </button>
                <span className="sound-row__name">
                  <span className="sound-row__pad">{pad.index + 1}</span> {pad.name}
                </span>
                <span className="sound-row__duration">{formatDuration(pad.channelData[0].length / pad.sampleRate)}</span>
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
            </div>
          ))}
        </div>
        <button className="menu__button" onClick={onClose}>
          {pads.length === 0 ? "Done" : "Keep the rest"}
        </button>
      </div>
    </div>
  );
}
