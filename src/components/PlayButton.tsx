/**
 * `onClick` gives simple tap-to-toggle behavior (used by the master loop,
 * which keeps looping until tapped again). `onPress`/`onRelease` instead
 * treat the button as a momentary trigger — press retriggers from the
 * beginning immediately, release stops it — used by each sample row's
 * one-shot preview.
 */
export function PlayButton({
  playing,
  onClick,
  onPress,
  onRelease,
  disabled,
}: {
  playing: boolean;
  onClick?: () => void;
  onPress?: () => void;
  onRelease?: () => void;
  disabled?: boolean;
}) {
  if (onPress) {
    return (
      <button
        className="preview-btn"
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          onPress();
        }}
        onPointerUp={() => onRelease?.()}
        onPointerLeave={() => onRelease?.()}
        onPointerCancel={() => onRelease?.()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {playing ? "⏹" : "▶"}
      </button>
    );
  }
  return (
    <button className="preview-btn" onClick={onClick} disabled={disabled}>
      {playing ? "⏹" : "▶"}
    </button>
  );
}
