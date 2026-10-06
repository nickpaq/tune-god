import type { SliderGuide } from "./PrecisionSlider";

/**
 * Drawn over the whole phone while the pitch slider is held: a graphite veil at half strength (so the screen stays readable through it) and, on it, how the
 * drag works. The three zones are named (above the track, along it, below it) and the one the finger is in is bright. Below the track the control gets finer: the
 * wedge starts as wide as the track and narrows to a tip where a sweep across the whole track moves the value by only the finest span. The bar across the
 * wedge at the finger's height is what a sweep across the track moves the value by right now.
 */
export function PitchGuide({ guide, phone, upLabel, reference }: { guide: SliderGuide; phone: HTMLElement; upLabel: string; reference: string | null }) {
  const box = phone.getBoundingClientRect();
  const x = (v: number) => v - box.left;
  const y = (v: number) => v - box.top;
  const left = x(guide.left);
  const right = x(guide.right);
  const width = right - left;
  const centre = (left + right) / 2;
  const trackTop = y(guide.top);
  const trackBottom = y(guide.bottom);
  const upEdge = trackTop - 12;
  const downEdge = trackBottom + 12;
  const startY = y(guide.startY);
  const tipY = startY + guide.room;
  const ratio = guide.fineSpan / guide.range;
  const half = (t: number) => (width / 2) * Math.pow(ratio, t);
  const steps = 24;
  const rightSide = Array.from({ length: steps + 1 }, (_, i) => `${centre + half(i / steps)},${startY + (tipY - startY) * (i / steps)}`);
  const leftSide = Array.from({ length: steps + 1 }, (_, i) => `${centre - half((steps - i) / steps)},${startY + (tipY - startY) * ((steps - i) / steps)}`);
  const wedge = [...rightSide, ...leftSide].join(" ");
  const fingerY = y(guide.y);
  const barHalf = (guide.sweep / guide.range) * (width / 2);
  const st = (cents: number) => `${(cents / 100).toFixed(cents >= 1000 ? 0 : 1)} ST`;
  const zoneClass = (z: string) => `pitch-guide__zone${guide.zone === z ? " pitch-guide__zone--on" : ""}`;
  const bottom = box.height;
  return (
    <div className="pitch-guide" aria-hidden="true">
      <svg width={box.width} height={box.height} viewBox={`0 0 ${box.width} ${box.height}`}>
        <defs>
          <linearGradient id="pitch-guide-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef2ec" stopOpacity="0.32" />
            <stop offset="1" stopColor="#eef2ec" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <line className="pitch-guide__rule" x1="0" x2={box.width} y1={upEdge} y2={upEdge} />
        <line className="pitch-guide__rule" x1="0" x2={box.width} y1={downEdge} y2={downEdge} />
        <text className={zoneClass("up")} x={left} y={upEdge - 8}>
          {upLabel}
        </text>
        <text className={zoneClass("track")} x={left} y={upEdge + 18}>
          Along: semitones
        </text>
        <text className={zoneClass("down")} x={left} y={Math.min(bottom - 8, downEdge + 46)}>
          Down: finer
        </text>
        <polygon points={wedge} fill="url(#pitch-guide-fill)" className="pitch-guide__wedge" />
        <text className="pitch-guide__tip" x={centre} y={Math.min(bottom - 6, tipY + 16)} textAnchor="middle">
          {st(guide.fineSpan)} across the tip
        </text>
        <text className="pitch-guide__tip" x={right} y={Math.min(bottom - 8, downEdge + 46)} textAnchor="end">
          {st(guide.range)} across the top
        </text>
        {guide.zone === "down" && (
          <>
            <line className="pitch-guide__bar" x1={centre - barHalf} x2={centre + barHalf} y1={fingerY} y2={fingerY} />
            <text className="pitch-guide__now" x={centre + barHalf + 6} y={fingerY + 4}>
              {st(guide.sweep)}
            </text>
          </>
        )}
        {reference && (
          <text className="pitch-guide__reference" x={box.width / 2} y={upEdge - 34} textAnchor="middle">
            {reference}
          </text>
        )}
      </svg>
    </div>
  );
}
