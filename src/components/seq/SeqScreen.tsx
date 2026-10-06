import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import "./seq.css";

/**
 * The sequencer's screens (docs/seq-sequencer-plan.md, drawings in docs/seq-designs/). This is the interface only: nothing here plays a sound, records
 * or writes a pattern yet. Keys, sliders and switches keep their own state so the screens can be tried out; the pads show the app's own pads for the bank.
 */

/** What a pad shows on the Play page: its words and colour, or null for a pad with no sound on it. */
export interface SeqPad {
  label: string;
  color: string;
}

export type SeqPage = "play" | "vel" | "pattern" | "edit" | "sounds" | "tempo" | "mixer" | "keys";

const BANK_NAMES = ["A", "B", "C", "D"] as const;

/** ---- small pieces ---- */

type IconName = "back" | "play" | "rec" | "mix" | "loop" | "notes" | "vel" | "pattern" | "edit" | "search" | "grid" | "piano" | "left" | "right" | "clear" | "double" | "step" | "erase" | "mute" | "undo" | "redo" | "history" | "length" | "empty" | "scissors" | "chev";

function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const solid = { fill: "currentColor", stroke: "none" } as const;
  switch (name) {
    case "back":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <circle cx="10" cy="10" r="8" />
            <path d="M11.5 6.5 8 10l3.5 3.5" />
          </g>
        </svg>
      );
    case "play":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...solid} d="M6 3.5v13l11-6.5z" />
        </svg>
      );
    case "rec":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle {...solid} cx="10" cy="10" r="6.5" />
        </svg>
      );
    case "mix":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M5 3v14M10 3v14M15 3v14" />
          <rect {...solid} x="3" y="11" width="4" height="3" rx="1" />
          <rect {...solid} x="8" y="5" width="4" height="3" rx="1" />
          <rect {...solid} x="13" y="8" width="4" height="3" rx="1" />
        </svg>
      );
    case "loop":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M5 9V8a3 3 0 0 1 3-3h7l-2.2-2.2M15 11v1a3 3 0 0 1-3 3H5l2.2 2.2" />
        </svg>
      );
    case "notes":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle {...solid} cx="5" cy="14.5" r="2.2" />
          <circle {...solid} cx="14" cy="12.5" r="2.2" />
          <path {...common} d="M7.2 14.5V5l9-2v9.5M7.2 7.5l9-2" />
        </svg>
      );
    case "vel":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M4 17V9M8 17V4M12 17V11M16 17V7" />
        </svg>
      );
    case "pattern":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...solid} d="M3.5 15.5 10 5l6.5 10.5z" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M1.5 10h2.2l1.6-5 2.4 10 2.2-8 1.6 5 1.4-2h5.6" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m12.8 12.8 5 5" />
          </g>
        </svg>
      );
    case "grid":
      return (
        <svg viewBox="0 0 22 22" aria-hidden="true">
          <path {...common} strokeWidth="1.4" d="M3 3h16v16H3zM3 8.3h16M3 13.7h16M8.3 3v16M13.7 3v16" />
        </svg>
      );
    case "piano":
      return (
        <svg viewBox="0 0 22 22" aria-hidden="true">
          <path {...common} strokeWidth="1.4" d="M3 3h16v16H3zM8.3 3v16M13.7 3v16" />
          <rect {...solid} x="6.6" y="3" width="3.4" height="9" />
          <rect {...solid} x="12" y="3" width="3.4" height="9" />
        </svg>
      );
    case "left":
      return (
        <svg viewBox="0 0 8 14" aria-hidden="true">
          <path {...common} strokeWidth="1.8" d="M6.5 1.5 1.5 7l5 5.5" />
        </svg>
      );
    case "right":
    case "chev":
      return (
        <svg viewBox="0 0 8 14" aria-hidden="true">
          <path {...common} strokeWidth="1.8" d="M1.5 1.5 6.5 7l-5 5.5" />
        </svg>
      );
    case "clear":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <rect x="2" y="6" width="7" height="8" rx="1.5" />
            <rect x="11" y="6" width="7" height="8" rx="1.5" />
          </g>
        </svg>
      );
    case "double":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <rect x="2" y="6" width="7" height="8" rx="1.5" />
            <rect x="11" y="6" width="7" height="8" rx="1.5" />
          </g>
          <circle {...solid} cx="5.5" cy="10" r="1.3" />
          <circle {...solid} cx="14.5" cy="10" r="1.3" />
        </svg>
      );
    case "step":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <rect x="2" y="6" width="16" height="8" rx="2" />
            <path d="M5.5 10h.01M8.5 10h.01M11.5 10h.01M14.5 10h.01" strokeWidth="2.4" />
          </g>
        </svg>
      );
    case "erase":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="m3.5 12.5 7-7.5a1.6 1.6 0 0 1 2.3 0l3.2 3.3a1.6 1.6 0 0 1 0 2.2L11 16.5H6.5zM8.5 7.8l5.2 5.4" />
        </svg>
      );
    case "mute":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M3 8h3l4-3.5v11L6 12H3zM13.5 7.5l4 5M17.5 7.5l-4 5" />
        </svg>
      );
    case "undo":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M3.5 8.5h8a4 4 0 0 1 0 8H8M3.5 8.5 7 5M3.5 8.5 7 12" />
        </svg>
      );
    case "redo":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M16.5 8.5h-8a4 4 0 0 0 0 8H12M16.5 8.5 13 5M16.5 8.5 13 12" />
        </svg>
      );
    case "history":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 5.5V10l3 2" />
          </g>
        </svg>
      );
    case "length":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path {...common} d="M2 10h16M5 6.5 2 10l3 3.5M15 6.5 18 10l-3 3.5" />
        </svg>
      );
    case "empty":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <rect x="2" y="5" width="16" height="10" rx="2" />
            <path d="m7.5 8.5 5 3M12.5 8.5l-5 3" />
          </g>
        </svg>
      );
    case "scissors":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <g {...common}>
            <circle cx="5" cy="14.5" r="2.4" />
            <circle cx="5" cy="5.5" r="2.4" />
            <path d="M7 7 17 15M7 13 17 5" />
          </g>
        </svg>
      );
  }
}

/** A key: icon over a short legend, a lit LED on top, pressed in while on. */
function Key({ icon, legend, on, dim, label, onClick, className = "", style, children }: { icon?: IconName; legend?: string; on?: boolean; dim?: boolean; label: string; onClick?: () => void; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <button type="button" className={`s-cap${on ? " s-cap--on" : ""}${dim ? " s-cap--dim" : ""} ${className}`} aria-label={label} aria-pressed={on === undefined ? undefined : on} style={style} onClick={onClick}>
      <span className="s-led" />
      {icon && <Icon name={icon} />}
      {legend}
      {children}
    </button>
  );
}

/** A switch row key: LED, On or Off. */
function SwitchKey({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`s-cap s-cap--side${on ? " s-cap--on" : ""}`} onClick={() => onChange(!on)}>
      <span className="s-led" />
      {on ? "On" : "Off"}
    </button>
  );
}

/** Pointer drag over a box, giving 0..1 along one axis (1 = right, or up). */
function useDrag(axis: "x" | "y", onValue: (v: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const t = axis === "x" ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height;
    onValue(Math.min(1, Math.max(0, t)));
  };
  return {
    ref,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      set(e);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e);
    },
  };
}

/** A horizontal slider: a groove, a lit fill from `from` to the value, and a round key for a thumb. */
function Slider({ value, onChange, from = 0, label }: { value: number; onChange: (v: number) => void; from?: number; label: string }) {
  const drag = useDrag("x", onChange);
  const lo = Math.min(from, value);
  const hi = Math.max(from, value);
  return (
    <div className="s-slider" role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} {...drag}>
      {from > 0 && <span className="s-slider__mid" />}
      <i style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
      <b style={{ left: `${value * 100}%` }} />
    </div>
  );
}

/** ---- the parts every page shares ---- */

interface TransportProps {
  page: SeqPage;
  playing: boolean;
  recording: boolean;
  bpm: number;
  onBack: () => void;
  onPage: (p: SeqPage) => void;
  onPlaying: (on: boolean) => void;
  onRecording: (on: boolean) => void;
}

function Transport({ page, playing, recording, bpm, onBack, onPage, onPlaying, onRecording }: TransportProps) {
  return (
    <div className="s-tray s-transport">
      <Key icon="back" legend="Back" label="Back to the other pages" onClick={onBack} />
      <button type="button" className={`s-bpm${page === "tempo" ? " s-bpm--on" : ""}`} aria-label={`Tempo ${bpm}`} onClick={() => onPage(page === "tempo" ? "play" : "tempo")}>
        <b>{bpm}</b>
        <i>BPM</i>
      </button>
      <Key icon="play" legend="Play" on={playing} label="Play" onClick={() => onPlaying(!playing)} />
      <Key icon="rec" legend="Rec" on={recording} label="Record" onClick={() => onRecording(!recording)} />
      <Key icon="mix" legend="Mix" on={page === "mixer"} label="Mixer" onClick={() => onPage(page === "mixer" ? "play" : "mixer")} />
    </div>
  );
}

const SCENE_LANES: { bank: number; on: boolean }[][] = [
  [{ bank: 0, on: true }, { bank: 1, on: true }, { bank: 2, on: true }, { bank: 3, on: false }],
  [{ bank: 0, on: true }, { bank: 1, on: true }, { bank: 2, on: true }, { bank: 3, on: true }],
];

function Strip({ looping, onLoop, playhead }: { looping: boolean; onLoop: (on: boolean) => void; playhead: number }) {
  return (
    <div className="s-strip">
      <Key icon="loop" on={looping} label="Loop" onClick={() => onLoop(!looping)} />
      <div className="s-scenes">
        {SCENE_LANES.map((lanes, scene) => (
          <div key={scene} className={`s-scene${scene === 0 ? " s-scene--sel" : " s-scene--dim"}`}>
            {lanes.map((lane, i) => (
              <div key={i} className={`s-lane${lane.on ? "" : " s-lane--off"}`} style={{ ["--lc" as string]: `var(--b${BANK_NAMES[lane.bank]})` }}>
                {lane.on ? (lane.bank === 0 || lane.bank === 1 ? scene + 1 : 1) : ""}
              </div>
            ))}
            {scene === 0 && <span className="s-playhead" style={{ left: `${playhead * 100}%` }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Banks({ bank, onBank }: { bank: number; onBank: (b: number) => void }) {
  return (
    <div className="s-tray s-banks">
      {BANK_NAMES.map((name, i) => (
        <button key={name} type="button" className={`s-cap${bank === i ? " s-cap--on" : ""}`} style={{ ["--lc" as string]: `var(--b${name})` }} aria-label={i === 3 ? "Bank D keys" : `Bank ${name}`} aria-pressed={bank === i} onClick={() => onBank(i)}>
          <span className="s-lamp" />
          {name}
          <Icon name={i === 3 ? "piano" : "grid"} />
        </button>
      ))}
    </div>
  );
}

const NAV: { page: SeqPage; icon: IconName; legend: string; label: string }[] = [
  { page: "play", icon: "notes", legend: "Play", label: "Play pads" },
  { page: "vel", icon: "vel", legend: "Vel", label: "Velocity" },
  { page: "pattern", icon: "pattern", legend: "Pattern", label: "Pattern" },
  { page: "edit", icon: "edit", legend: "Edit", label: "Sample edit" },
  { page: "sounds", icon: "search", legend: "Sounds", label: "Sounds" },
];

function Nav({ page, onPage }: { page: SeqPage; onPage: (p: SeqPage) => void }) {
  return (
    <div className="s-tray s-nav">
      {NAV.map((n) => (
        <Key key={n.page} icon={n.icon} legend={n.legend} on={page === n.page} label={n.label} onClick={() => onPage(n.page)} />
      ))}
    </div>
  );
}

/** ---- the pages ---- */

function PlayPage({ pads, bank, selected, onSelect, hit }: { pads: (SeqPad | null)[]; bank: number; selected: number; onSelect: (slot: number) => void; hit: number | null }) {
  const pad = pads[selected];
  const steps = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  return (
    <>
      <section className="screen s-screen s-screen--play" aria-label="Pattern display">
        <div className="oled">
          <div className="oled__head">
            <span>Pattern 1</span>
            <span>1.1.1</span>
          </div>
          <div className="s-oled-line">
            {BANK_NAMES[bank]}
            {selected + 1} {pad ? pad.label : "Empty"}
          </div>
          <div className="s-steps">
            {steps.map((on, i) => (
              <i key={i} className={on ? "on" : ""} />
            ))}
          </div>
        </div>
      </section>
      <div className="s-padzone">
        {pads.map((p, slot) => (
          <button
            key={slot}
            type="button"
            className={`s-pad${p ? " s-pad--loaded" : ""}${selected === slot ? " s-pad--sel" : ""}${hit === slot ? " s-pad--hit" : ""}`}
            style={p ? { ["--c" as string]: p.color } : undefined}
            aria-label={p ? `Pad ${slot + 1}, ${p.label}` : `Pad ${slot + 1}, empty`}
            onPointerDown={() => onSelect(slot)}
          >
            {p && <b>{p.label}</b>}
          </button>
        ))}
      </div>
    </>
  );
}

function PatternPage() {
  const [pattern, setPattern] = useState(0);
  const [noPattern, setNoPattern] = useState(false);
  const THUMBS = [
    "k...ks..h.k..s.h",
    "k....s.hk....s..",
    ".h.hk....hs.k..h",
    "kk...s..h.h.k.s.",
  ];
  return (
    <div className="s-page s-page--pattern">
      <section className="screen s-screen s-screen--bar" aria-label="Pattern">
        <div className="oled">
          <div className="oled__head">
            <span>Pattern {pattern + 1}</span>
            <button type="button" className="s-oled-btn" aria-label="Delete pattern">
              Delete
            </button>
          </div>
        </div>
      </section>
      <div className="s-tray s-tray--tall">
        {THUMBS.map((t, i) => (
          <button key={i} type="button" className={`s-cap s-cap--pat${pattern === i ? " s-cap--on" : ""}`} aria-label={`Pattern ${i + 1}`} aria-pressed={pattern === i} onClick={() => setPattern(i)}>
            <span className="s-led" />
            <b>{i + 1}</b>
            <span className="s-mx">
              {[...t].map((c, j) => (
                <i key={j} className={c === "k" ? "on k" : c === "s" ? "on s" : c === "h" ? "on h" : ""} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="s-group">
        <div className="s-row">
          <Icon name="empty" />
          <span>No pattern in scene</span>
          <SwitchKey label="No pattern in scene" on={noPattern} onChange={setNoPattern} />
        </div>
        <div className="s-row">
          <Icon name="length" />
          <span>Pattern length</span>
          <span className="s-row__value">4 bars</span>
          <Icon name="chev" />
        </div>
      </div>
      <div className="s-keys2">
        <Key icon="clear" legend="Clear" label="Clear pattern" />
        <Key icon="double" legend="Double" label="Double pattern" />
      </div>
      <div className="s-keys2">
        <Key icon="step" legend="Step mode" label="Step mode" />
      </div>
      <div className="s-keys2">
        <Key icon="erase" legend="Erase" label="Erase" />
        <Key icon="mute" legend="Mute" label="Mute" />
      </div>
      <div className="s-keys2">
        <Key icon="undo" legend="Undo" dim label="Undo" />
        <Key icon="redo" legend="Redo" dim label="Redo" />
      </div>
      <div className="s-group s-group--end">
        <div className="s-row">
          <Icon name="history" />
          <span>History</span>
          <span className="s-row__value" />
          <Icon name="chev" />
        </div>
      </div>
    </div>
  );
}

function TempoPage({ bpm, onBpm }: { bpm: number; onBpm: (v: number) => void }) {
  const [swing, setSwing] = useState(0);
  const [quantize, setQuantize] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [autoEnable, setAutoEnable] = useState(false);
  const digits = String(bpm).padStart(3, "0").split("").map(Number);
  /** Dragging a column up or down steps its digit; one step per 28 pixels. */
  const stepColumn = (place: number) => {
    let start = 0;
    let base = bpm;
    return {
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start = e.clientY;
        base = bpm;
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const steps = Math.round((start - e.clientY) / 28);
        onBpm(Math.min(300, Math.max(20, base + steps * 10 ** place)));
      },
    };
  };
  return (
    <div className="s-page s-page--tempo">
      <section className="screen s-screen s-screen--wheel" aria-label="Tempo">
        <div className="oled">
          <div className="oled__head">
            <span>Tempo</span>
            <span>BPM</span>
          </div>
          <div className="s-wheel">
            {digits.map((d, i) => (
              <div key={i} className="s-wheel__col" {...stepColumn(2 - i)}>
                <span>{(d + 9) % 10}</span>
                <span className="cur">{d}</span>
                <span>{(d + 1) % 10}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <button type="button" className="s-tap">
        Tap
      </button>
      <div className="s-group">
        <div className="s-row">
          <span className="s-row__label">Swing</span>
          <Slider value={swing} onChange={setSwing} label="Swing" />
          <span className="s-readout">{Math.round(swing * 100)}%</span>
        </div>
        <div className="s-row">
          <span>Quantize</span>
          <SwitchKey label="Quantize" on={quantize} onChange={setQuantize} />
        </div>
      </div>
      <div className="s-group">
        <div className="s-row">
          <span>Metronome</span>
          <SwitchKey label="Metronome" on={metronome} onChange={setMetronome} />
        </div>
        <div className="s-row">
          <span>Auto-enable when recording</span>
          <SwitchKey label="Auto-enable when recording" on={autoEnable} onChange={setAutoEnable} />
        </div>
      </div>
    </div>
  );
}

function MixerPage({ bank, onBank }: { bank: number; onBank: (b: number) => void }) {
  const [levels, setLevels] = useState([0.58, 0.72, 0.54, 0.78]);
  const [muted, setMuted] = useState([false, false, false, false]);
  const [fx, setFx] = useState<[boolean, boolean][]>([[false, true], [false, true], [false, true], [false, true]]);
  const [tab, setTab] = useState<"mixer" | "fx1" | "fx2">("mixer");
  const meters = [62, 48, 70, 34];
  const dB = (v: number) => (v >= 0.75 ? ((v - 0.75) * 24).toFixed(1) : (-(0.75 - v) * 40).toFixed(1));
  return (
    <div className="s-page s-page--mixer">
      <Banks bank={bank} onBank={onBank} />
      <div className="s-channels">
        {BANK_NAMES.map((name, i) => (
          <MixerChannel
            key={name}
            name={name}
            level={levels[i]}
            meter={meters[i]}
            muted={muted[i]}
            fx={fx[i]}
            readout={dB(levels[i])}
            onLevel={(v) => setLevels((l) => l.map((x, j) => (j === i ? v : x)))}
            onMute={() => setMuted((m) => m.map((x, j) => (j === i ? !x : x)))}
            onFx={(k) => setFx((f) => f.map((pair, j) => (j === i ? (pair.map((x, n) => (n === k ? !x : x)) as [boolean, boolean]) : pair)))}
          />
        ))}
      </div>
      <div className="s-segs">
        {(["mixer", "fx1", "fx2"] as const).map((t) => (
          <Key key={t} legend={t === "mixer" ? "Mixer" : t === "fx1" ? "FX1" : "FX2"} on={tab === t} label={t === "mixer" ? "Mixer" : t === "fx1" ? "FX 1" : "FX 2"} onClick={() => setTab(t)} />
        ))}
      </div>
    </div>
  );
}

function MixerChannel({ name, level, meter, muted, fx, readout, onLevel, onMute, onFx }: { name: string; level: number; meter: number; muted: boolean; fx: [boolean, boolean]; readout: string; onLevel: (v: number) => void; onMute: () => void; onFx: (k: number) => void }) {
  const drag = useDrag("y", onLevel);
  return (
    <div className="s-chan" style={{ ["--lc" as string]: `var(--b${name})` }}>
      <div className="s-chan__fx">
        <Key legend="FX1" on={fx[0]} label={`Bank ${name} FX 1`} className="s-cap--fx" onClick={() => onFx(0)} />
        <Key legend="FX2" on={fx[1]} label={`Bank ${name} FX 2`} className="s-cap--fx" onClick={() => onFx(1)} />
      </div>
      <div className="s-fader">
        <div className="s-meter">
          <u style={{ height: `${muted ? 0 : meter}%` }} />
        </div>
        <div className="s-travel" role="slider" aria-label={`Bank ${name} level`} aria-valuenow={Math.round(level * 100)} {...drag}>
          <span className="s-ticks s-ticks--l" />
          <span className="s-ticks" />
          <b style={{ bottom: `calc((100% - var(--px) * 26) * ${level})` }} />
        </div>
      </div>
      <div className="s-readout s-readout--full">{readout}</div>
      <Key legend="Mute" on={muted} label={`Mute bank ${name}`} className="s-cap--mute" onClick={onMute} />
    </div>
  );
}

function VelocityPage() {
  const [level, setLevel] = useState(0.42);
  const [quant, setQuant] = useState("1/4");
  const drag = useDrag("y", setLevel);
  const grid = [19, 32, 45, 58, 71, 84];
  return (
    <div className="s-page s-page--vel">
      <div className="s-velrow">
        <section className="screen s-screen s-screen--a" aria-label="Default velocity">
          <div className="oled">
            <div className="oled__head">
              <span>Default</span>
            </div>
            <div className="s-plot" role="slider" aria-label="Default velocity" aria-valuenow={Math.round(level * 127)} {...drag}>
              <div className="s-plot__mm" style={{ top: "4%" }}>
                Max
              </div>
              {grid.map((g) => (
                <div key={g} className="s-plot__g" style={{ top: `${g}%` }} />
              ))}
              <div className="s-plot__lvl" style={{ top: `${(1 - level) * 100}%` }} />
              <div className="s-plot__mm" style={{ bottom: "4%" }}>
                Min
              </div>
            </div>
          </div>
        </section>
        <section className="screen s-screen s-screen--b" aria-label="Live play velocity">
          <div className="oled">
            <div className="oled__head">
              <span>Live play</span>
            </div>
            <div className="s-plot">
              <div className="s-plot__mm" style={{ top: "4%" }}>
                Max
              </div>
              {grid.map((g) => (
                <div key={g} className="s-plot__g" style={{ top: `${g}%` }} />
              ))}
              <div className="s-plot__mm" style={{ bottom: "4%" }}>
                Min
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="s-quant">
        <Key legend="Off" on={quant === "off"} label="Quantize off" className="s-cap--txt s-cap--off" onClick={() => setQuant("off")} />
        <div className="s-tray">
          {["1/4", "1/8", "1/16", "1/16T", "1/32"].map((q) => (
            <Key key={q} legend={q} on={quant === q} label={`Quantize ${q}`} className="s-cap--txt" onClick={() => setQuant(q)} />
          ))}
        </div>
      </div>
    </div>
  );
}

const NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const SHARPS: { i: number; name: string }[] = [
  { i: 0, name: "C#" },
  { i: 1, name: "D#" },
  { i: 3, name: "F#" },
  { i: 4, name: "G#" },
  { i: 5, name: "A#" },
];
/** The notes of C major as semitones above the root, lit on the scale lamps. */
const IN_SCALE = [true, false, true, false, true, true, false, true, false, true, false, true];

function Octave({ held, onHold }: { held: string | null; onHold: (n: string | null) => void }) {
  return (
    <>
      <div className="s-scale">
        {IN_SCALE.map((on, i) => (
          <i key={i} className={i === 0 ? "root" : on ? "in" : ""} />
        ))}
      </div>
      <div className="s-piano">
        <div className="s-naturals">
          {NOTES.map((n, k) => (
            <button key={n} type="button" className={`s-nat${held === n ? " s-nat--on" : ""}`} aria-label={n} onPointerDown={() => onHold(n)} onPointerUp={() => onHold(null)} onPointerLeave={() => onHold(null)}>
              <span className={`s-dot${k === 0 ? " s-dot--root" : " s-dot--in"}`} />
              {n}
            </button>
          ))}
        </div>
        {SHARPS.map((s) => (
          <button key={s.name} type="button" className={`s-sharp${held === s.name ? " s-sharp--on" : ""}`} style={{ ["--i" as string]: s.i }} aria-label={`${s.name}`} onPointerDown={() => onHold(s.name)} onPointerUp={() => onHold(null)} onPointerLeave={() => onHold(null)}>
            <span className="s-dot" />
            {s.name}
          </button>
        ))}
      </div>
    </>
  );
}

function KeysPage() {
  const [scale, setScale] = useState(false);
  const [chord, setChord] = useState(false);
  const [octave, setOctave] = useState(2);
  const [held, setHeld] = useState<string | null>(null);
  return (
    <div className="s-page s-page--keys">
      <div className="s-keys2">
        <Key legend="Scale" on={scale} label="Scale" onClick={() => setScale((x) => !x)} />
        <Key legend="Chord" on={chord} label="Chord" onClick={() => setChord((x) => !x)} />
        <div className="s-tray s-octave">
          <button type="button" className="s-cap s-cap--step" aria-label="Octave down" onClick={() => setOctave((o) => Math.max(-2, o - 1))}>
            <Icon name="left" />
          </button>
          <div className="s-readout s-readout--oct">C{octave}</div>
          <button type="button" className="s-cap s-cap--step" aria-label="Octave up" onClick={() => setOctave((o) => Math.min(8, o + 1))}>
            <Icon name="right" />
          </button>
        </div>
      </div>
      <div className="s-board">
        <Octave held={held} onHold={setHeld} />
        <Octave held={null} onHold={setHeld} />
      </div>
    </div>
  );
}

/** The hot-swap list for the selected pad, on the same pixel screen the Swap mode uses. */
function SoundsPage({ list, slotName }: { list: ReactNode; slotName: string }) {
  return (
    <div className="s-page">
      <section className="screen s-screen s-screen--fill" aria-label="Sounds">
        <div className="oled">
          {list ? (
            <>
              <div className="oled__head">
                <span>Hot swap</span>
                <span>{slotName}</span>
              </div>
              {list}
            </>
          ) : (
            <>
              <div className="oled__head">
                <span>Hot swap</span>
                <span>{slotName}</span>
              </div>
              <div className="s-oled-center">Tap a pad with a sound on it</div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

const WAVE =
  "0,48 2,34 4,19 6,35 8,37 10,37 12,28 14,37 16,25 18,27 20,18 22,22 24,41 26,38 28,42 30,32 32,35 34,47 36,34 38,43 40,41 42,35 44,47 46,42 48,39 50,36 52,46 54,52 56,54 58,43 60,42 62,45 64,48 66,45 68,51 70,57 72,49 74,48 76,54 78,59 80,58 82,59 84,59 87,56 89,60 91,55 93,53 95,59 97,59 99,53 101,61 103,61 105,58 107,64 109,61 111,56 113,60 115,59 117,57 119,58 121,62 123,65 125,65 127,64 129,64 131,66 133,66 135,67 137,63 139,65 141,65 143,62 145,65 147,67 149,66 151,63 153,68 155,65 157,65 159,66 161,64 163,67 165,68 167,66 169,67 171,65 173,65 175,66 177,69 179,68 181,70 183,69 185,66 187,66 189,66 191,69 193,69 195,68 197,67 199,68 201,70 203,67 205,68 207,70 209,70 211,68 213,70 215,69 217,71 219,68 221,71 223,68 225,70 227,71 229,69 231,70 233,70 235,69 237,71 239,71 241,71 243,71 245,71 247,70 249,71 251,71 253,71 256,71 258,72 260,72 262,70 264,71 266,71 268,72 270,72 272,71 274,71 276,70 278,71 280,71 282,71 284,71 286,71 288,71 290,71 292,71 294,72 296,72 298,72 300,71 302,72 304,71 306,71 308,72 310,72 312,71 314,72 316,72 318,72 320,71 322,72 324,73 326,72 328,73 330,71 332,73 334,73 336,72 338,72 340,72 340,78 338,79 336,77 334,79 332,78 330,79 328,79 326,78 324,78 322,78 320,77 318,78 316,78 314,78 312,79 310,78 308,79 306,79 304,78 302,79 300,79 298,79 296,78 294,78 292,78 290,80 288,78 286,79 284,80 282,79 280,79 278,79 276,79 274,79 272,79 270,78 268,79 266,80 264,79 262,79 260,79 258,80 256,79 253,78 251,80 249,81 247,81 245,79 243,81 241,80 239,80 237,79 235,79 233,81 231,81 229,81 227,79 225,80 223,81 221,81 219,81 217,79 215,80 213,82 211,81 209,82 207,82 205,81 203,82 201,82 199,83 197,81 195,83 193,81 191,81 189,81 187,84 185,82 183,83 181,82 179,81 177,83 175,84 173,85 171,86 169,82 167,85 165,85 163,83 161,85 159,87 157,82 155,83 153,87 151,83 149,84 147,83 145,86 143,89 141,84 139,85 137,84 135,89 133,86 131,85 129,84 127,85 125,85 123,90 121,88 119,91 117,92 115,86 113,91 111,92 109,91 107,90 105,89 103,92 101,90 99,89 97,97 95,93 93,98 91,99 89,94 87,100 84,93 82,99 80,92 78,97 76,100 74,95 72,106 70,102 68,102 66,107 64,100 62,103 60,99 58,104 56,107 54,104 52,110 50,99 48,103 46,115 44,110 42,113 40,106 38,113 36,110 34,106 32,104 30,112 28,117 26,124 24,108 22,113 20,108 18,118 16,134 14,116 12,134 10,114 8,125 6,129 4,125 2,117 0,121";

function EditPage({ pad, slotName }: { pad: SeqPad | null; slotName: string }) {
  const [tune, setTune] = useState(0.38);
  const [gain, setGain] = useState(0.76);
  const [pan, setPan] = useState(0.5);
  const [oneShot, setOneShot] = useState(true);
  const [choke, setChoke] = useState(true);
  const [reverse, setReverse] = useState(false);
  return (
    <div className="s-page s-page--edit">
      <section className="screen s-screen s-screen--wave" aria-label="Sample">
        <div className="oled">
          <div className="oled__head">
            <span>{pad ? pad.label : "Empty pad"}</span>
            <span>{slotName}</span>
          </div>
          <div className="s-wave">
            <svg viewBox="0 0 340 150" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 75H340" stroke="rgba(238,242,236,.28)" strokeWidth="1" fill="none" />
              <polygon fill="currentColor" points={WAVE} />
            </svg>
          </div>
        </div>
      </section>
      <div className="s-keys2">
        <Key icon="play" legend="Audition" label="Audition" />
        <Key icon="scissors" legend="Trim" label="Trim" />
      </div>
      <div className="s-group">
        <div className="s-row">
          <span className="s-row__label">Tune</span>
          <Slider value={tune} from={0.5} onChange={setTune} label="Tune" />
          <span className="s-readout">{((tune - 0.5) * 24).toFixed(1)}</span>
        </div>
        <div className="s-row">
          <span className="s-row__label">Gain</span>
          <Slider value={gain} onChange={setGain} label="Gain" />
          <span className="s-readout">{((gain - 0.76) * 12).toFixed(1)}</span>
        </div>
        <div className="s-row">
          <span className="s-row__label">Pan</span>
          <Slider value={pan} from={0.5} onChange={setPan} label="Pan" />
          <span className="s-readout">{Math.abs(pan - 0.5) < 0.02 ? "C" : pan < 0.5 ? `L${Math.round((0.5 - pan) * 200)}` : `R${Math.round((pan - 0.5) * 200)}`}</span>
        </div>
      </div>
      <div className="s-group">
        <div className="s-row">
          <span>One-shot</span>
          <SwitchKey label="One-shot" on={oneShot} onChange={setOneShot} />
        </div>
        <div className="s-row">
          <span>Choke</span>
          <SwitchKey label="Choke" on={choke} onChange={setChoke} />
        </div>
        <div className="s-row">
          <span>Reverse</span>
          <SwitchKey label="Reverse" on={reverse} onChange={setReverse} />
        </div>
      </div>
      <div className="s-group">
        <div className="s-row">
          <span>Color</span>
          <span className="s-swatch" style={{ background: pad?.color ?? "var(--well)" }} />
          <Icon name="chev" />
        </div>
      </div>
    </div>
  );
}

/** ---- the whole sequencer screen ---- */

export function SeqScreen({ padsOfBank, soundsFor, onBack }: { padsOfBank: (bank: number) => (SeqPad | null)[]; soundsFor: (bank: number, slot: number) => ReactNode; onBack: () => void }) {
  const [page, setPage] = useState<SeqPage>("play");
  const [bank, setBank] = useState(0);
  const [selected, setSelected] = useState(15);
  const [hit, setHit] = useState<number | null>(null);
  const [bpm, setBpm] = useState(85);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [looping, setLooping] = useState(true);

  const pads = padsOfBank(bank === 3 ? 3 : bank);
  const slotName = `${BANK_NAMES[bank]}${selected + 1}`;
  /** Bank keys: A to C show that bank's pads, D is the keys page. */
  const chooseBank = (b: number) => {
    setBank(b);
    setPage(b === 3 ? "keys" : "play");
  };
  const go = (p: SeqPage) => {
    setPage(p);
    if (p === "keys") setBank(3);
    else if (bank === 3) setBank(0);
  };
  const showStrip = page === "play" || page === "vel" || page === "pattern" || page === "keys";
  const showBanks = page === "play" || page === "pattern" || page === "keys";
  const showNav = page !== "tempo";
  const showTransport = page !== "edit";

  return (
    <div className="seq">
      <div className="s-upper">
        {showTransport ? (
          <Transport page={page} playing={playing} recording={recording} bpm={bpm} onBack={onBack} onPage={go} onPlaying={setPlaying} onRecording={setRecording} />
        ) : (
          <div className="s-tray s-tabs">
            <Key icon="back" legend="Back" label="Back to the other pages" onClick={onBack} />
            <Key legend="Record" label="Record" />
            <Key legend="Edit" on label="Edit" />
          </div>
        )}
        {showStrip && <Strip looping={looping} onLoop={setLooping} playhead={playing ? 0.34 : 0} />}
        {page === "play" && <PlayPage pads={pads} bank={bank} selected={selected} onSelect={(s) => { setSelected(s); setHit(s); window.setTimeout(() => setHit(null), 120); }} hit={hit} />}
        {page === "vel" && <VelocityPage />}
        {page === "pattern" && <PatternPage />}
        {page === "keys" && <KeysPage />}
        {page === "tempo" && <TempoPage bpm={bpm} onBpm={setBpm} />}
        {page === "mixer" && <MixerPage bank={bank} onBank={setBank} />}
        {page === "edit" && <EditPage pad={pads[selected]} slotName={slotName} />}
        {page === "sounds" && <SoundsPage list={soundsFor(bank, selected)} slotName={slotName} />}
      </div>
      {(showBanks || showNav) && (
        <div className="s-lower">
          {showBanks && <Banks bank={bank} onBank={chooseBank} />}
          {showNav && <Nav page={page} onPage={go} />}
        </div>
      )}
    </div>
  );
}
