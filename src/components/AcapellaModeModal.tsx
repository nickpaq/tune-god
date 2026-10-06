export type ChopMode = "acapella" | "chopper";

const ACAPELLA_POINTS = [
  "Stays in time with the project, even if the BPM changes",
  "Can be repitched without going out of sync",
  "Limited to 16 chops, one pad each",
  "Overwrites everything on Bank D",
  "Leaves the project's BPM alone",
  "Needs a song and its VOCALS stem in the project",
];

const CHOPPER_POINTS = [
  "Up to 127 chops, all on one pad",
  "Does not stay in sync with the project",
  "Changing the pitch, or Koala's BPM, takes it out of time",
  "Sets the project's BPM to match the sample (and follows the pitch)",
  "Works on any sample over 10 seconds",
];

/** Asked when Acapella is tapped: the two ways to chop a long sample, and what each one does. */
export function AcapellaModeModal({ onChoose, onCancel }: { onChoose: (mode: ChopMode) => void; onCancel: () => void }) {
  return (
    <div className="palette-backdrop" onClick={onCancel}>
      <div className="palette-modal" role="dialog" aria-label="Chop mode" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Chop a long sample</strong>
          <button onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__list">
          <button className="menu__button" onClick={() => onChoose("acapella")}>
            Acapella mode
          </button>
          <ul className="mode-points">
            {ACAPELLA_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <button className="menu__button" onClick={() => onChoose("chopper")}>
            Chopper mode
          </button>
          <ul className="mode-points">
            {CHOPPER_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
