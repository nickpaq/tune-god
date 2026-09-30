export type PadView = "swap" | "tune";

const Drum = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="9" rx="8" ry="3" />
    <path d="M4 9v6c0 1.7 3.6 3 8 3s8-1.3 8-3V9M8 12v5M12 12.5v5.5M16 12v5M6 3l5 5M18 3l-5 5" />
  </svg>
);

const Note = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M9 4v11.3A3.5 3.5 0 1 0 11 18.5V8.6l8-1.8V13a3.5 3.5 0 1 0 2 3.2V3z" />
  </svg>
);

/** Switches the top box between the drum swap list and the tuning controls. */
export function ViewToggle({ view, onChange }: { view: PadView; onChange: (v: PadView) => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Pad view">
      <button className={view === "swap" ? "view-toggle--on" : ""} onClick={() => onChange("swap")} aria-pressed={view === "swap"} aria-label="Swap drums">
        <Drum />
      </button>
      <button className={view === "tune" ? "view-toggle--on" : ""} onClick={() => onChange("tune")} aria-pressed={view === "tune"} aria-label="Tuning">
        <Note />
      </button>
    </div>
  );
}
