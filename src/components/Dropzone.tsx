import React, { useCallback, useState } from "react";

interface Props {
  label: string;
  hint: string;
  multiple?: boolean;
  /** Also accept .koala project files (Koala Sampler), not just plain audio. */
  allowKoala?: boolean;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ label, hint, multiple, allowKoala, onFiles }: Props) {
  const [isOver, setIsOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsOver(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type.startsWith("audio/") ||
          f.name.match(/\.(wav|wave|mp3|aif|aiff|caf|flac|m4a|ogg)$/i) ||
          (allowKoala && f.name.match(/\.koala$/i)),
      );
      if (files.length) onFiles(files);
    },
    [onFiles, allowKoala],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onFiles(files);
      e.target.value = "";
    },
    [onFiles],
  );

  return (
    <label
      className={`dropzone${isOver ? " dropzone--over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
    >
      {/* iOS's Files picker filters by UTI derived from `accept`, and plain
          "audio/*" greys out many real audio files (loops synced from other
          apps, iCloud Drive files, etc.) that lack clean MIME metadata.
          Listing extensions alongside it makes iOS match by UTI per-extension
          instead, which is far more reliable there. */}
      <input
        type="file"
        accept={`audio/*,.wav,.wave,.aif,.aiff,.caf,.mp3,.m4a,.flac,.ogg${allowKoala ? ",.koala" : ""}`}
        multiple={multiple}
        onChange={handleInput}
        hidden
      />
      <div className="dropzone__label">{label}</div>
      <div className="dropzone__hint">{hint}</div>
    </label>
  );
}
