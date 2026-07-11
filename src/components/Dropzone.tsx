import React, { useCallback, useState } from "react";

interface Props {
  label: string;
  hint: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ label, hint, multiple, onFiles }: Props) {
  const [isOver, setIsOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("audio/") || f.name.match(/\.(wav|mp3|aif|aiff|flac|m4a|ogg)$/i));
      if (files.length) onFiles(files);
    },
    [onFiles],
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
      <input type="file" accept="audio/*" multiple={multiple} onChange={handleInput} hidden />
      <div className="dropzone__label">{label}</div>
      <div className="dropzone__hint">{hint}</div>
    </label>
  );
}
