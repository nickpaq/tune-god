import { useEffect, useRef, useState } from "react";
import { decodeNative, type DecodedAudio } from "../audio/decode";
import { MIC_ICON, SONG_ICON } from "./dropIcons";
import { PixelIcon } from "./PixelIcon";
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

/**
 * Shown after two audio files are picked for acapella mode: each file with a play button and a pixel icon that says its role, a music note for
 * the song and a microphone for the vocal. Tapping either icon swaps the roles, so choosing the song for one file makes the other the vocal.
 */
export function AcapellaFilesModal({ song, stem, onSwap, onCancel, onUse }: { song: File; stem: File; onSwap: () => void; onCancel: () => void; onUse: () => void }) {
  const preview = useSoundPreview();
  const decoded = useRef(new Map<File, DecodedAudio>());
  const [busy, setBusy] = useState<File | null>(null);
  useEffect(() => () => preview.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async (file: File) => {
    const key = file === song ? 0 : 1;
    if (preview.playing === key) return preview.stop();
    let audio = decoded.current.get(file);
    if (!audio) {
      setBusy(file);
      try {
        audio = await decodeNative(file);
        decoded.current.set(file, audio);
      } catch {
        window.alert("That file could not be played.");
        return;
      } finally {
        setBusy(null);
      }
    }
    preview.toggle(key, audio.channelData, audio.sampleRate);
  };

  const row = (file: File, role: "song" | "vocal") => {
    const key = file === song ? 0 : 1;
    const playing = preview.playing === key;
    return (
      <div className="acap-files__row" key={role}>
        <button className="acap-files__role" onClick={() => { preview.stop(); onSwap(); }} aria-label={`${role === "song" ? "Song" : "Vocal"}: tap to swap with the other file`}>
          <PixelIcon rows={role === "song" ? SONG_ICON : MIC_ICON} scale={1} />
          <span>{role === "song" ? "Song" : "Vocal"}</span>
        </button>
        <span className="acap-files__name" title={file.name}>{file.name}</span>
        <button className={`swap-row__btn${playing ? " swap-row__btn--on" : ""}`} onClick={() => void play(file)} aria-label={`${playing ? "Stop" : "Play"} ${file.name}`}>
          {busy === file ? "…" : playing ? <StopGlyph /> : <PlayGlyph />}
        </button>
      </div>
    );
  };

  return (
    <div className="palette-backdrop" onClick={onCancel}>
      <div className="acap-files" role="dialog" aria-label="Which file is which" onClick={(e) => e.stopPropagation()}>
        <div className="acap-files__head">Which is which?</div>
        {row(song, "song")}
        {row(stem, "vocal")}
        <div className="acap-files__hint">Tap an icon to swap song and vocal</div>
        <div className="acap-files__actions">
          <button className="acap-files__btn" onClick={onCancel}>Cancel</button>
          <button className="acap-files__btn acap-files__btn--go" onClick={() => { preview.stop(); onUse(); }}>Use these</button>
        </div>
      </div>
    </div>
  );
}
