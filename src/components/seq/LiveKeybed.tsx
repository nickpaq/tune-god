import { useState, type PointerEvent } from "react";
const WHITE = [
  { note: 0, name: "C", x: 31, left: 0, right: 47.5 },
  { note: 2, name: "D", x: 158, left: 45.5, right: 71.5 },
  { note: 4, name: "E", x: 285, left: 74.5, right: 114 },
  { note: 5, name: "F", x: 412, left: 0, right: 47.5 },
  { note: 7, name: "G", x: 539, left: 45.5, right: 71.5 },
  { note: 9, name: "A", x: 666, left: 69.5, right: 95.5 },
  { note: 11, name: "B", x: 793, left: 98.5, right: 114 },
];
const BLACK = [{ note: 1, name: "C♯", x: 99 }, { note: 3, name: "D♯", x: 251 }, { note: 6, name: "F♯", x: 478 }, { note: 8, name: "G♯", x: 630 }, { note: 10, name: "A♯", x: 782 }];
/** One fixed coordinate system scales both octaves uniformly, including key cutouts. */
export function LiveKeybed({ octave, onDown, onUp }: { octave: number; onDown: (pointer: number, pitch: number) => void; onUp: (pointer: number) => void }) {
  const [held, setHeld] = useState<Record<number, number>>({});
  const release = (pointer: number) => { onUp(pointer); setHeld(previous => { const next = { ...previous }; delete next[pointer]; return next; }); };
  const gesture = (pitch: number) => ({
    onPointerDown: (event: PointerEvent<SVGElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onDown(event.pointerId, pitch); setHeld(previous => ({ ...previous, [event.pointerId]: pitch })); },
    onPointerUp: (event: PointerEvent<SVGElement>) => release(event.pointerId),
    onPointerCancel: (event: PointerEvent<SVGElement>) => release(event.pointerId),
    onLostPointerCapture: (event: PointerEvent<SVGElement>) => release(event.pointerId),
  });
  return <svg className="live-keybed" viewBox="0 0 942 978" aria-label="Two octave keyboard">
    {[0, 1].map(row => <g key={row} transform={`translate(0 ${row * 538})`}>
      {WHITE.map(key => {
        const pitch = key.note + row * 12 + octave * 12;
        const l = key.left, r = key.right;
        const right = r === 114 ? "V432" : `V222 Q${r} 230 ${r + 8} 230 H106 Q114 230 114 238 V432`;
        const left = l === 0 ? "V8" : `V238 Q0 230 8 230 H${l - 8} Q${l} 230 ${l} 222 V8`;
        const path = `M${l + 8} 0 H${r - 8} Q${r} 0 ${r} 8 ${right} Q114 440 106 440 H8 Q0 440 0 432 ${left} Q${l} 0 ${l + 8} 0 Z`;
        return <path key={key.note} transform={`translate(${key.x} 0)`} d={path} className={`live-keybed__white${Object.values(held).includes(pitch) ? " is-held" : ""}`} role="button" tabIndex={0} aria-label={`${key.name}, octave ${row + octave + 2}`} {...gesture(pitch)} onKeyDown={e => { if (!e.repeat && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onDown(-pitch - 1000, pitch); } }} onKeyUp={e => { if (e.key === " " || e.key === "Enter") onUp(-pitch - 1000); }} />;
      })}
      {BLACK.map(key => {
        const pitch = key.note + row * 12 + octave * 12;
        return <g key={key.note}><rect x={key.x - 15.5} y={0} width={114} height={218} rx={12} className={`live-keybed__black${Object.values(held).includes(pitch) ? " is-held" : ""}`} pointerEvents="none" aria-hidden="true" /><rect x={key.x - 15.5} y={0} width={114} height={218} className="live-keybed__hit" role="button" tabIndex={0} aria-label={`${key.name}, octave ${row + octave + 2}`} {...gesture(pitch)} onKeyDown={e => { if (!e.repeat && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onDown(-pitch - 1000, pitch); } }} onKeyUp={e => { if (e.key === " " || e.key === "Enter") onUp(-pitch - 1000); }} /></g>;
      })}
    </g>)}
  </svg>;
}
