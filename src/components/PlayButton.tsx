export function PlayButton({
  playing,
  onClick,
  disabled,
}: {
  playing: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="preview-btn" onClick={onClick} disabled={disabled}>
      {playing ? "⏸" : "▶"}
    </button>
  );
}
