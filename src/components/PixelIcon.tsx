/** `scale` is how many screen cells one pixel of the art takes (2 for the small sort-key icons, 1 for the 20 x 20 start-screen icons). */
export function PixelIcon({ rows, scale = 2 }: { rows: string[]; scale?: number }) {
  const cols = rows[0].length;
  return (
    <svg
      className="pixel-icon"
      viewBox={`0 0 ${cols} ${rows.length}`}
      style={{ width: `calc(var(--cell) * ${cols * scale})`, height: `calc(var(--cell) * ${rows.length * scale})` }}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}
