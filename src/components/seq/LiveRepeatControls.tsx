import { useRef } from "react";
import { REPEAT_RATES } from "../../audio/seq/repeat";
export function LiveRepeatControls({ velocity, rate, heldRates, onChange, onPlay, onRelease }: { velocity: number; rate: number; heldRates: readonly number[]; onChange: (kind: "velocity" | "rate", value: number, pointer?: number) => void; onPlay: (pointer: number, kind: "velocity" | "rate") => void; onRelease: (pointer: number) => void }) {
  const drag = useRef(new Map<number, { kind: "velocity" | "rate"; top: number; height: number }>());
  const change = (kind: "velocity" | "rate", y: number, top: number, height: number, pointer?: number) => {
    const value = Math.max(0, Math.min(1, 1 - (y - top) / height));
    onChange(kind, kind === "velocity" ? Math.max(1, Math.round(value * 127)) : Math.round(value * (REPEAT_RATES.length - 1)), pointer);
  };
  return <div className="live-repeat">
    {(["velocity", "rate"] as const).map(kind => <section key={kind} className="live-repeat__panel">
      <header>{kind === "velocity" ? "Velocity" : "Repeat"}</header>
      <div className="live-repeat__surface" role="slider" tabIndex={0} aria-label={kind === "velocity" ? "Live velocity" : "Live repeat rate"} aria-valuemin={kind === "velocity" ? 1 : 0} aria-valuemax={kind === "velocity" ? 127 : 9} aria-valuenow={kind === "velocity" ? velocity : rate} aria-valuetext={kind === "rate" ? REPEAT_RATES[rate].label : String(velocity)}
        onPointerDown={event => { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); drag.current.set(event.pointerId, { kind, top: bounds.top, height: bounds.height }); event.currentTarget.setPointerCapture(event.pointerId); change(kind, event.clientY, bounds.top, bounds.height, event.pointerId); onPlay(event.pointerId, kind); }}
        onPointerMove={event => { const g = drag.current.get(event.pointerId); if (g) change(g.kind, event.clientY, g.top, g.height, event.pointerId); }}
        onPointerUp={event => { drag.current.delete(event.pointerId); onRelease(event.pointerId); }}
        onPointerCancel={event => { drag.current.delete(event.pointerId); onRelease(event.pointerId); }}
        onLostPointerCapture={event => { drag.current.delete(event.pointerId); onRelease(event.pointerId); }}
        onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const value = kind === "velocity" ? velocity : rate; const max = kind === "velocity" ? 127 : 9; onChange(kind, Math.max(kind === "velocity" ? 1 : 0, Math.min(max, value + (event.key === "ArrowUp" ? 1 : -1)))); } }}>
        {kind === "rate" ? REPEAT_RATES.map((entry, i) => <span key={entry.label} className={`${rate === i ? "is-current" : ""}${heldRates.includes(i) ? " is-held" : ""}`} style={{ bottom: `${i / 9 * 92 + 4}%` }}>{entry.label}</span>) : <><span style={{ top: "4%" }}>127</span><span style={{ bottom: "4%" }}>1</span><b style={{ bottom: `${velocity / 127 * 92 + 4}%` }}>{velocity}</b></>}
      </div>
    </section>)}
  </div>;
}
