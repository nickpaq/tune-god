import { useEffect, useRef, useState } from "react";
import { decodeNative, type DecodedAudio } from "../audio/decode";
import { useSoundPreview } from "./useSoundPreview";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/**
 * Acapella mode, after two audio files are picked: the same list as the chopper's sample selector (play button, name, length), with a Song / Vocal
 * button on each row. Pressing it on one file makes the other the opposite, so the two are always one song and one vocal.
 */
export function AcapellaFilesModal({ song, stem, onSwap, onCancel, onUse }: { song: File; stem: File; onSwap: () => void; onCancel: () => void; onUse: () => void }) {
  const preview = useSoundPreview();
  // The rows stay where they are when the roles swap: only the buttons change.
  const order = useRef([song, stem]).current;
  const decoded = useRef(new Map<File, DecodedAudio>());
  const [lengths, setLengths] = useState<Map<File, number>>(new Map());
  useEffect(() => () => preview.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Decode both once, for the length and for playing.
  useEffect(() => {
    let gone = false;
    for (const file of [song, stem]) {
      if (decoded.current.has(file)) continue;
      decodeNative(file)
        .then((audio) => {
          decoded.current.set(file, audio);
          if (!gone) setLengths((prev) => new Map(prev).set(file, audio.channelData[0].length / audio.sampleRate));
        })
        .catch(() => {
          /* an unreadable file is reported when the project is made */
        });
    }
    return () => {
      gone = true;
    };
  }, [song, stem]);

  const row = (file: File, role: "Song" | "Vocal", key: number) => {
    const audio = decoded.current.get(file);
    return (
      <div key={key} className="sound-row">
        <div className="sound-row__head">
          <button
            className="sound-row__icon"
            disabled={!audio}
            onPointerDown={() => audio && preview.toggle(key, audio.channelData, audio.sampleRate)}
            aria-label={`${preview.playing === key ? "Stop" : "Play"} ${file.name}`}
          >
            {preview.playing === key ? "■" : "▶"}
          </button>
          <span className="sound-row__name">{file.name}</span>
          <span className="sound-row__duration">{lengths.has(file) ? formatDuration(lengths.get(file)!) : ""}</span>
          <button
            className="sound-row__chop"
            onClick={() => {
              preview.stop();
              onSwap();
            }}
            aria-label={`${file.name} is the ${role.toLowerCase()}: tap to swap song and vocal`}
          >
            {role}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="palette-backdrop" onClick={onCancel}>
      <div className="palette-modal" role="dialog" aria-label="Song and vocal" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Song and vocal</strong>
          <button onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">Play each file to check it. The button says what it is; press it to swap song and vocal.</div>
        <div className="palette-modal__list">
          {order.map((file, i) => row(file, file === song ? "Song" : "Vocal", i))}
        </div>
        <button
          className="menu__button"
          onClick={() => {
            preview.stop();
            onUse();
          }}
        >
          Use these
        </button>
      </div>
    </div>
  );
}
