import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
} from "react";
import type { Pad } from "../PadPanel";
import { PadButton } from "../PadButton";
import type { CategoryId } from "../../audio/classify";
import { Waveform } from "../Waveform";
import { useSequencer, type Sequencer, type Sound } from "./useSequencer";
import { validSequence } from "../../audio/seq/session";
import {
  duplicateScene,
  addScene,
  removeScene,
  ownTrack,
  patternFor,
  patternLength,
  performance,
  selectSlot,
  trackId,
  uid,
  type StretchMode,
} from "../../audio/seq/model";
import "./seq.css";
import "./recording.css";
export interface SeqPad extends Sound {
  symbol?: CategoryId;
}
type Page =
  "play" | "performance" | "pattern" | "edit" | "sounds" | "tempo" | "mixer";
const BANKS = ["A", "B", "C", "D"];
const GRIDS: [string, number][] = [
  ["Off", 0],
  ["1/4", 1],
  ["1/8", 0.5],
  ["1/16", 0.25],
  ["1/16T", 1 / 6],
  ["1/32", 0.125],
];
function Control({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="q-control">
      <span>
        {label} <b>{Number(value.toFixed(2))}</b>
      </span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function WaveControls({
  sound,
  seq,
  bpm,
  beats,
}: {
  sound: Sound;
  seq: Sequencer;
  bpm: number;
  beats: number;
}) {
  const s = seq.config(sound),
    index = sound.pad.index;
  const patch = (p: Partial<typeof s>) => seq.changeSettings(index, p);
  return (
    <>
      <div className="q-wave" style={{ color: sound.color }}>
        <Waveform channelData={sound.pad.channelData} />
        <div
          className="q-region"
          style={{
            left: `${s.start * 100}%`,
            width: `${(s.end - s.start) * 100}%`,
          }}
        />
        {(["start", "end"] as const).map((edge) => (
          <input
            className={`q-marker q-marker--${edge}`}
            key={edge}
            aria-label={`${edge} marker`}
            type="range"
            min={edge === "start" ? 0 : s.start + 0.001}
            max={edge === "start" ? s.end - 0.001 : 1}
            step="0.001"
            value={s[edge]}
            onChange={(e) => patch({ [edge]: Number(e.target.value) })}
          />
        ))}
      </div>
      <Control
        label="Start (%)"
        value={s.start * 100}
        min={0}
        max={s.end * 100 - 0.1}
        step={0.1}
        onChange={(v) => patch({ start: v / 100 })}
      />
      <Control
        label="End (%)"
        value={s.end * 100}
        min={s.start * 100 + 0.1}
        max={100}
        step={0.1}
        onChange={(v) => patch({ end: v / 100 })}
      />
      {performance(sound.pad.category ?? "other") === "loop" && (
        <>
          <label className="q-control">
            Target bars{" "}
            <input
              aria-label="Target bars"
              type="number"
              min={0.25}
              max={64}
              step={0.25}
              value={s.bars}
              onChange={(e) => {
                const bars = Number(e.target.value);
                if (bars >= 0.25 && bars <= 64) patch({ bars });
              }}
            />
          </label>
          <label className="q-control">
            Stretch mode{" "}
            <select
              aria-label="Stretch mode"
              value={s.stretch}
              onChange={(e) =>
                patch({ stretch: e.target.value as StretchMode })
              }
            >
              <option value="off">Off</option>
              <option value="modern">Modern · keep pitch</option>
              <option value="beats">Beats · keep attacks</option>
              <option value="repitch">Repitch · change speed</option>
            </select>
          </label>
          <p className="q-hint">
            Selected region → {s.bars} bars ·{" "}
            {((s.bars * beats * 60) / bpm).toFixed(2)} seconds at {bpm} BPM
          </p>
        </>
      )}
    </>
  );
}
function Arrangement({
  seq,
  sounds,
  drill,
  selected,
  beats,
}: {
  seq: Sequencer;
  sounds: Sound[];
  drill: boolean;
  selected: number;
  beats: number;
}) {
  const bank = Math.floor(selected / 16);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ index: number; time: number } | null>(null);
  const consumed = useRef(false);
  const finishSwipe = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dy = e.clientY - start.y,
      dx = e.clientX - start.x;
    if (Math.abs(dy) < 32 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    consumed.current = true;
    seq.stop();
    if (dy > 0) {
      seq.edit((s) => duplicateScene(s, index));
      seq.chooseScene(index + 1);
    } else {
      seq.edit((s) => removeScene(s, index));
      seq.chooseScene(Math.max(0, index - 1));
    }
  };
  const rows = drill
    ? sounds
        .filter((s) => Math.floor(s.pad.index / 16) === bank)
        .map((s) => ({
          id: `pad:${s.pad.index}`,
          label: s.label,
          color: s.color,
          pad: s.pad.index,
          bank,
        }))
    : [
        ...BANKS.map((name, b) => {
          const members = sounds.filter(
            (s) =>
              Math.floor(s.pad.index / 16) === b &&
              !ownTrack(s.pad.category ?? "other"),
          );
          return members.length
            ? {
                id: `bank:${b}`,
                label: `Bank ${name}`,
                color: members[0].color,
                pad: -1,
                bank: b,
              }
            : null;
        }).filter((r) => r !== null),
        ...sounds
          .filter((s) => ownTrack(s.pad.category ?? "other"))
          .map((s) => ({
            id: `pad:${s.pad.index}`,
            label: s.label,
            color: s.color,
            pad: s.pad.index,
            bank: Math.floor(s.pad.index / 16),
          })),
      ];
  return (
    <div
      className="q-arrangement"
      style={{ height: Math.min(196, Math.max(110, rows.length * 11 + 20)) }}
      aria-label={drill ? `Bank ${BANKS[bank]} pad patterns` : "Arrangement"}
    >
      <button
        className="q-add"
        aria-label="Add arrangement section"
        onClick={() => {
          const next = seq.scene + 1;
          seq.stop();
          seq.edit((s) => addScene(s, seq.scene));
          seq.chooseScene(next);
        }}
      >
        +
      </button>
      <div className="q-scenes">
        {seq.sequence.scenes.map((scene, i) => (
          <button
            key={scene.id}
            className={`q-scene ${i === seq.scene ? "selected" : ""}`}
            style={{
              width: Math.max(
                80,
                Math.min(480, (seq.sceneLength(i) / beats) * 80),
              ),
            }}
            aria-label={`Arrangement section ${i + 1}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              swipe.current = { x: e.clientX, y: e.clientY };
              consumed.current = false;
            }}
            onPointerUp={(e) => {
              const start = swipe.current;
              finishSwipe(e, i);
              if (!start || consumed.current) return;
              const dx = Math.abs(e.clientX - start.x);
              const dy = Math.abs(e.clientY - start.y);
              if (dx >= 18 || dy >= 18) {
                lastTap.current = null;
                return;
              }
              const now = Date.now();
              const previous = lastTap.current;
              if (previous?.index === i && now - previous.time <= 350) {
                lastTap.current = null;
                consumed.current = true;
                seq.stop();
                seq.chooseScene(i);
                seq.setLooping(!seq.looping);
              } else {
                lastTap.current = { index: i, time: now };
              }
            }}
            onPointerCancel={() => {
              swipe.current = null;
              lastTap.current = null;
            }}
            onClick={() => {
              if (consumed.current) {
                consumed.current = false;
                return;
              }
              seq.chooseScene(i);
            }}
            aria-pressed={i === seq.scene && seq.looping}
            title="Double-tap to toggle section loop; swipe down to copy; swipe up to delete"
          >
            <span className="q-scene-number">
              {Object.keys(scene.refs).length ? i + 1 : ""}
            </span>
            <div className="q-scene-rows">
              {rows.map((row) => {
                const p = patternFor(seq.sequence, i, `bank:${row.bank}`),
                  lane = p?.pads[row.pad],
                  length = patternLength(p, beats),
                  sceneLength = seq.sceneLength(i),
                  unit = row.pad >= 0 ? (lane?.beats ?? beats) : length;
                return (
                  <div
                    key={row.id}
                    className="q-track"
                    style={{ "--track": row.color } as CSSProperties}
                    title={`${row.label}: ${unit / beats} bars`}
                  >
                    {Array.from(
                      { length: Math.ceil(sceneLength / unit) },
                      (_, n) => (
                        <span
                          key={n}
                          className={
                            row.pad >= 0
                              ? !lane?.events.length || lane.muted
                                ? "empty"
                                : ""
                              : !p
                                ? "empty"
                                : ""
                          }
                          style={{
                            width: `${(Math.min(unit, sceneLength - n * unit) / sceneLength) * 100}%`,
                          }}
                        >
                          {row.pad >= 0
                            ? lane
                              ? `${unit / beats}`
                              : "No pattern"
                            : p
                              ? `${(seq.sequence.libraries[`bank:${row.bank}`]?.findIndex((x) => x?.id === p.id) ?? 0) + 1}`
                              : "No pattern"}
                        </span>
                      ),
                    )}
                  </div>
                );
              })}
            </div>
            {seq.playing && seq.position.scene === i && (
              <i
                className="q-playhead"
                style={{
                  left: `${(seq.position.beat / seq.sceneLength(i)) * 100}%`,
                }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
function PatternEditor({
  seq,
  sound,
  beats,
}: {
  seq: Sequencer;
  sound: Sound;
  beats: number;
}) {
  const [scope, setScope] = useState<"pad" | "bank">("pad");
  const index = sound.pad.index,
    track = trackId(index),
    pattern = patternFor(seq.sequence, seq.scene, track),
    lane = pattern?.pads[index];
  return (
    <div className="q-panel">
      <div className="q-toggle">
        <button aria-pressed={scope === "pad"} onClick={() => setScope("pad")}>
          Pad pattern
        </button>
        <button
          aria-pressed={scope === "bank"}
          onClick={() => setScope("bank")}
        >
          Bank pattern
        </button>
      </div>
      {scope === "bank" ? (
        <>
          <h3>
            Bank {BANKS[Math.floor(index / 16)]} ·{" "}
            {pattern
              ? `${patternLength(pattern, beats) / beats} bars`
              : "No pattern in this section"}
          </h3>
          <p className="q-hint">
            Tap an empty slot to make this section unique. Existing slots reuse
            a shared pattern.
          </p>
          <div className="q-slots">
            {Array.from({ length: 8 }, (_, i) => {
              const p = seq.sequence.libraries[track]?.[i];
              return (
                <button
                  key={i}
                  aria-label={`Bank pattern slot ${i + 1}${p ? "" : " empty"}`}
                  aria-pressed={p?.id === pattern?.id && !!p}
                  onClick={() => {
                    seq.stop();
                    seq.edit((s) => selectSlot(s, seq.scene, track, i));
                  }}
                >
                  {i + 1}
                  <small>
                    {p ? "Pattern" : pattern ? "Copy here" : "Empty"}
                  </small>
                </button>
              );
            })}
          </div>
          <button
            onClick={() =>
              seq.edit((s) => {
                const p = patternFor(s, seq.scene, track);
                if (p)
                  for (const lane of Object.values(p.pads)) lane.events = [];
              })
            }
          >
            Clear bank pattern
          </button>
        </>
      ) : (
        <>
          <h3>
            {sound.label} ·{" "}
            {lane ? `${lane.beats / beats} bars` : "No pattern in this section"}
          </h3>
          <label className="q-control">
            Pad pattern bars{" "}
            <input
              aria-label="Pad pattern bars"
              type="number"
              min={0.25}
              max={64}
              step={0.25}
              value={(lane?.beats ?? beats) / beats}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0.25 && n <= 64) {
                  seq.stop();
                  seq.laneEdit(index, (l) => {
                    l.beats = n * beats;
                    l.events = l.events.filter((e) => e.beat < l.beats);
                  });
                }
              }}
            />
          </label>
          <div
            className="q-event-roll"
            aria-label={`${lane?.events.length ?? 0} recorded events`}
          >
            {lane?.events.map((e) => (
              <i
                key={e.id}
                title={`${e.kind} at ${e.beat.toFixed(2)} beats`}
                style={{
                  left: `${(e.beat / lane.beats) * 100}%`,
                  width: `${e.kind === "note" ? Math.max(1, (Math.min(e.duration, lane.beats - e.beat) / lane.beats) * 100) : 1}%`,
                  background: e.kind === "mute" ? "var(--accent)" : sound.color,
                  top: e.kind === "note" ? `${50 - e.note}%` : "80%",
                }}
              />
            ))}
          </div>
          <div className="q-toggle">
            <button
              onClick={() =>
                seq.laneEdit(index, (l) => {
                  l.events = [];
                })
              }
            >
              Clear pad pattern
            </button>
            <button
              aria-pressed={!!lane?.muted}
              onClick={() => {
                seq.laneEdit(index, (l) => {
                  l.muted = !l.muted;
                });
                seq.audio.current?.mute(index, !lane?.muted);
              }}
            >
              Mute pad pattern
            </button>
          </div>
          <button
            onClick={() =>
              seq.laneEdit(index, (l) => {
                if (l.beats >= beats * 64) return;
                const copy = l.events.map((e) => ({
                  ...e,
                  id: uid(),
                  beat: e.beat + l.beats,
                }));
                l.events.push(...copy);
                l.beats *= 2;
              })
            }
          >
            Double pad pattern
          </button>
          <p className="q-hint">
            Edits apply to every arrangement copy of this bank pattern. Use Bank
            pattern → an empty slot to make this section unique.
          </p>
        </>
      )}
    </div>
  );
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SeqScreen({
  bpm,
  padsOfBank,
  soundsFor,
  onBack,
  onPitch,
  projectId,
  beatsPerBar = 4,
}: {
  bpm: number;
  padsOfBank: (bank: number) => (SeqPad | null)[];
  soundsFor: (bank: number, slot: number) => ReactNode;
  onBack: () => void;
  onPitch: (index: number, pitch: number) => void;
  projectId: string;
  beatsPerBar?: number;
}) {
  const sounds = BANKS.flatMap((_, bank) =>
    padsOfBank(bank).filter((s): s is SeqPad => !!s),
  );
  const seq = useSequencer(sounds, bpm, beatsPerBar, projectId);
  const [page, setPage] = useState<Page>("play"),
    [bank, setBank] = useState(0),
    [selected, setSelected] = useState(sounds[0]?.pad.index ?? 0),
    [linkSource, setLinkSource] = useState<number | null>(null);
  const [velocity, setVelocity] = useState(0.8),
    [repeat, setRepeat] = useState(0),
    [octave, setOctave] = useState(0);
  const repeats = useRef(new Map<number, number>()),
    velocityRef = useRef(velocity);
  velocityRef.current = velocity;
  const sound = sounds.find((s) => s.pad.index === selected),
    kind = performance(sound?.pad.category ?? "other"),
    settings = sound ? seq.config(sound) : null;
  const bankPads = padsOfBank(bank);
  const pageName =
    kind === "keys"
      ? "Keyboard"
      : kind === "loop"
        ? "Loop stretch"
        : "Velocity / Repeat";
  useEffect(
    () => () => {
      for (const t of repeats.current.values()) clearInterval(t);
    },
    [],
  );
  useEffect(() => {
    for (const t of repeats.current.values()) clearInterval(t);
    repeats.current.clear();
  }, [page, bank, repeat]);
  const press = (
    e: PointerEvent<HTMLButtonElement>,
    index: number,
    note = 0,
    keyboard = false,
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (linkSource !== null) {
      seq.link(linkSource, index);
      setSelected(linkSource);
      setBank(Math.floor(linkSource / 16));
      setLinkSource(null);
      setPage("edit");
      return;
    }
    setSelected(index);
    seq.liveDown(
      index,
      note,
      velocityRef.current,
      `pointer:${e.pointerId}`,
      keyboard,
    );
    if (repeat > 0 && !keyboard)
      repeats.current.set(
        e.pointerId,
        window.setInterval(
          () => {
            seq.liveUp(`pointer:${e.pointerId}`);
            seq.liveDown(
              index,
              note,
              velocityRef.current,
              `pointer:${e.pointerId}`,
              false,
            );
          },
          (repeat * 60000) / bpm,
        ),
      );
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    clearInterval(repeats.current.get(e.pointerId));
    repeats.current.delete(e.pointerId);
    seq.liveUp(`pointer:${e.pointerId}`);
  };
  const close = () => {
    seq.stop();
    onBack();
  };
  const performancePage = () => {
    if (!sound || !settings)
      return <p className="q-hint">Select a loaded pad.</p>;
    if (kind === "loop")
      return (
        <div className="q-panel">
          <h3>{sound.label} · Loop stretch</h3>
          <WaveControls sound={sound} seq={seq} bpm={bpm} beats={beatsPerBar} />
          <button
            className="q-audition"
            onPointerDown={(e) => press(e, selected)}
            onPointerUp={release}
            onPointerCancel={release}
          >
            Play loop
          </button>
          {sound.pad.category === "drumLoop" && (
            <button
              className="q-quant-mute"
              aria-pressed={!!seq.muted[selected]}
              onClick={() => seq.toggleMute(selected)}
            >
              Quantized Mute · {seq.muted[selected] ? "Muted" : "Audible"}
            </button>
          )}
          <p className="q-hint">
            Live presses are immediate. Recorded positions snap on the next
            pass.
          </p>
        </div>
      );
    if (kind === "keys")
      return (
        <div className="q-panel q-key-page">
          <h3>{sound.label} · Keyboard</h3>
          <div className="q-toggle">
            <button onClick={() => setOctave((o) => Math.max(-3, o - 1))}>
              Octave −
            </button>
            <span>
              C {octave >= 0 ? "+" : ""}
              {octave}
            </span>
            <button onClick={() => setOctave((o) => Math.min(3, o + 1))}>
              Octave +
            </button>
          </div>
          <div className="q-keyboard">
            {Array.from({ length: 24 }, (_, i) => (
              <button
                key={i}
                aria-label={`Key ${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][i % 12]} ${Math.floor(i / 12) + octave}`}
                className={
                  [1, 3, 6, 8, 10].includes(i % 12) ? "black" : "white"
                }
                onPointerDown={(e) => press(e, selected, i + octave * 12, true)}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
              >
                {
                  [
                    "C",
                    "C#",
                    "D",
                    "D#",
                    "E",
                    "F",
                    "F#",
                    "G",
                    "G#",
                    "A",
                    "A#",
                    "B",
                  ][i % 12]
                }
              </button>
            ))}
          </div>
          <p className="q-hint">
            C plays the Tune-menu root and current pitch trim.
          </p>
        </div>
      );
    return (
      <div className="q-panel q-drum-performance">
        <h3>{sound.label}</h3>
        <div className="q-repeat">
          <label>
            Repeat{" "}
            <select
              aria-label="Note repeat"
              value={repeat}
              onChange={(e) => setRepeat(Number(e.target.value))}
            >
              {GRIDS.map(([label, value]) => (
                <option key={label} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Control
            label="Velocity"
            value={Math.round(velocity * 127)}
            min={1}
            max={127}
            onChange={(v) => setVelocity(v / 127)}
          />
        </div>
        <div className="q-velocity-panels">
          <label>
            Default
            <input
              aria-label="Default velocity"
              type="range"
              min={1}
              max={127}
              value={Math.round(velocity * 127)}
              onChange={(e) => setVelocity(Number(e.target.value) / 127)}
            />
          </label>
          <button
            aria-label="Live play velocity"
            onPointerDown={(e) => {
              velocityRef.current = Math.max(
                0.02,
                1 -
                  (e.clientY - e.currentTarget.getBoundingClientRect().top) /
                    e.currentTarget.clientHeight,
              );
              setVelocity(velocityRef.current);
              press(e, selected);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                velocityRef.current = Math.max(
                  0.02,
                  Math.min(
                    1,
                    1 -
                      (e.clientY -
                        e.currentTarget.getBoundingClientRect().top) /
                        e.currentTarget.clientHeight,
                  ),
                );
                setVelocity(velocityRef.current);
              }
            }}
            onPointerUp={release}
            onPointerCancel={release}
          >
            <span>Live Play</span>
            <i style={{ bottom: `${velocity * 100}%` }} />
            Max ↑<br />
            Min ↓
          </button>
        </div>
      </div>
    );
  };
  const tracks = useMemo(() => {
    const map = new Map<string, Sound>();
    for (const s of sounds) {
      const id = ownTrack(s.pad.category ?? "other")
        ? `pad:${s.pad.index}`
        : `bank:${Math.floor(s.pad.index / 16)}`;
      if (!map.has(id)) map.set(id, s);
    }
    return [...map.entries()];
  }, [sounds]);
  return (
    <div className="seq q-seq">
      <header className="q-transport">
        <button onClick={close}>Back</button>
        <button onClick={() => setPage("tempo")}>
          {bpm}
          <small>BPM</small>
        </button>
        <button
          aria-pressed={seq.playing}
          onClick={() => (seq.playing ? seq.stop() : void seq.start(false))}
        >
          {seq.playing ? "Stop" : "Play"}
        </button>
        <button
          aria-pressed={seq.recording}
          onClick={() => void seq.start(!seq.recording)}
        >
          Rec
        </button>
        <button onClick={() => setPage("mixer")}>Mix</button>
      </header>
      <Arrangement
        seq={seq}
        sounds={sounds}
        drill={page === "pattern" && kind !== "keys"}
        selected={selected}
        beats={beatsPerBar}
      />
      <div className="q-status">
        <span>{seq.looping ? "Loop section ↻" : "Play arrangement →"}</span>
        <span role="status">{seq.status}</span>
      </div>
      <main className="q-main">
        {page === "play" && (
          <>
            <div className="q-selection">
              {linkSource !== null ? (
                <>
                  Link Pads: tap a target{" "}
                  <button
                    onClick={() => {
                      setLinkSource(null);
                      setPage("edit");
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {sound?.label ?? "Select a pad"} · {pageName}
                </>
              )}
            </div>
            <div
              className={`padzone q-padzone ${linkSource !== null ? "q-link-pick" : ""}`}
            >
              <div className="pads">
                {bankPads.map((p, i) => (
                  <PadButton
                    key={i}
                    caption={p?.label ?? ""}
                    slot={i}
                    symbol={p?.symbol}
                    locked={p?.pad.locked}
                    className={[
                      "pad",
                      p && "pad--loaded",
                      p?.pad.tune && "pad--tuned",
                      p?.pad.locked && "pad--locked",
                      selected === bank * 16 + i && "pad--selected",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={`Pad ${BANKS[bank]}${i + 1}${p ? ", " + p.label : ""}`}
                    style={
                      p ? ({ "--c": p.color } as CSSProperties) : undefined
                    }
                    onPointerDown={(e) => press(e, bank * 16 + i)}
                    onPointerUp={release}
                    onPointerCancel={release}
                    onLostPointerCapture={release}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                ))}
              </div>
            </div>
          </>
        )}
        {page === "performance" && performancePage()}
        {page === "pattern" &&
          (sound ? (
            <PatternEditor seq={seq} sound={sound} beats={beatsPerBar} />
          ) : (
            <p>Select a loaded pad first.</p>
          ))}
        {page === "edit" && sound && settings && (
          <div className="q-panel">
            <h3>{sound.label} · Pad settings</h3>
            <WaveControls
              sound={sound}
              seq={seq}
              bpm={bpm}
              beats={beatsPerBar}
            />
            <Control
              label="Pitch trim (semitones)"
              min={-12}
              max={12}
              step={0.01}
              value={sound.pad.semis + sound.pad.cents / 100}
              onChange={(v) => onPitch(selected, v)}
            />
            <Control
              label="Volume"
              min={0}
              max={1.5}
              step={0.01}
              value={settings.volume}
              onChange={(v) => seq.changeSettings(selected, { volume: v })}
            />
            <Control
              label="Pan"
              min={-1}
              max={1}
              step={0.01}
              value={settings.pan}
              onChange={(v) => seq.changeSettings(selected, { pan: v })}
            />
            <label>
              <input
                type="checkbox"
                checked={settings.oneShot}
                disabled={kind === "drums" || sound.pad.category === "drumLoop"}
                onChange={(e) =>
                  seq.changeSettings(selected, { oneShot: e.target.checked })
                }
              />{" "}
              One shot
            </label>
            <label>
              Choking{" "}
              <select
                aria-label="Choking"
                value={settings.choke}
                onChange={(e) =>
                  seq.changeSettings(selected, {
                    choke: Number(e.target.value),
                  })
                }
              >
                <option value={0}>Off</option>
                <option value={-1}>Choke self</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    Group {n}
                  </option>
                ))}
              </select>
            </label>
            {sound.pad.category === "bass" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.glide > 0}
                    onChange={(e) =>
                      seq.changeSettings(selected, {
                        glide: e.target.checked ? 60 : 0,
                      })
                    }
                  />{" "}
                  Glide
                </label>
                <Control
                  label="Glide (ms)"
                  min={0}
                  max={500}
                  value={settings.glide}
                  onChange={(v) => seq.changeSettings(selected, { glide: v })}
                />
              </>
            )}
            <div className="q-links">
              <span>Link Pads</span>
              <button
                aria-label="Add linked pad"
                onClick={() => {
                  setLinkSource(selected);
                  setPage("play");
                }}
              >
                +
              </button>
              {settings.links.map((i) => (
                <button
                  key={i}
                  aria-label={`Remove link to pad ${BANKS[Math.floor(i / 16)]}${(i % 16) + 1}`}
                  onClick={() =>
                    seq.changeSettings(selected, {
                      links: settings.links.filter((n) => n !== i),
                    })
                  }
                >
                  {BANKS[Math.floor(i / 16)]}
                  {(i % 16) + 1} ×
                </button>
              ))}
            </div>
          </div>
        )}
        {page === "sounds" && (
          <div className="q-panel">{soundsFor(bank, selected % 16)}</div>
        )}
        {page === "tempo" && (
          <div className="q-panel">
            <h3>Recording timing</h3>
            <label>
              Quantization{" "}
              <select
                aria-label="Recording quantization"
                value={seq.grid}
                onChange={(e) => seq.setGrid(Number(e.target.value))}
              >
                {GRIDS.map(([name, value]) => (
                  <option key={name} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p className="q-hint">
              Live pads, keys and mute presses sound immediately. Recorded
              events snap on the next pass.
            </p>
            <button
              onClick={() => download("tune-god-patterns.json", seq.sequence)}
            >
              Download pattern backup
            </button>
            <label>
              Restore patterns
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  try {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const value = JSON.parse(await f.text());
                    if (!validSequence(value)) throw Error();
                    seq.importSequence(value);
                  } catch {
                    window.alert("Choose a Tune God pattern backup.");
                  }
                }}
              />
            </label>
          </div>
        )}
        {page === "mixer" && (
          <div className="q-panel">
            <h3>Mixer</h3>
            {tracks.map(([id, s]) => (
              <div key={id} style={{ color: s.color }}>
                <Control
                  label={
                    id.startsWith("pad:")
                      ? s.label
                      : `Bank ${BANKS[Math.floor(s.pad.index / 16)]}`
                  }
                  value={seq.mix[id] ?? 1}
                  min={0}
                  max={1.5}
                  step={0.01}
                  onChange={(v) => {
                    seq.setMix((m) => ({ ...m, [id]: v }));
                    seq.audio.current?.setTrack(id, v);
                  }}
                />
              </div>
            ))}
            <h3>Kick → Bass ducking</h3>
            <label>
              <input
                type="checkbox"
                checked={seq.duck.on}
                onChange={(e) =>
                  seq.setDuck((d) => ({ ...d, on: e.target.checked }))
                }
              />{" "}
              Duck all Bass/808 tracks
            </label>
            <Control
              label="Reduction (dB)"
              min={0}
              max={24}
              value={seq.duck.db}
              onChange={(v) => seq.setDuck((d) => ({ ...d, db: v }))}
            />
            <Control
              label="Attack (ms)"
              min={0}
              max={50}
              value={seq.duck.attack}
              onChange={(v) => seq.setDuck((d) => ({ ...d, attack: v }))}
            />
            <Control
              label="Release (ms)"
              min={20}
              max={1000}
              value={seq.duck.release}
              onChange={(v) => seq.setDuck((d) => ({ ...d, release: v }))}
            />
          </div>
        )}
      </main>
      <footer className="q-footer">
        <div className="q-banks tray">
          {BANKS.map((name, b) => (
            <button
              className={`cap cap--bank${bank === b ? " cap--on" : ""}`}
              key={name}
              aria-label={`Bank ${name}`}
              aria-pressed={bank === b}
              onClick={() => {
                setBank(b);
                if (linkSource === null) setPage("play");
              }}
            >
              <span className="cap__led" />
              <span className="cap__legend">{name}</span>
            </button>
          ))}
        </div>
        <nav className="q-nav">
          <button
            aria-pressed={page === "play"}
            onClick={() => setPage("play")}
          >
            Pads
          </button>
          <button
            aria-pressed={page === "performance"}
            onClick={() => setPage("performance")}
          >
            {pageName}
          </button>
          <button
            aria-pressed={page === "pattern"}
            onClick={() => setPage("pattern")}
          >
            Pattern
          </button>
          <button
            aria-pressed={page === "edit"}
            onClick={() => setPage("edit")}
          >
            Waveform
          </button>
          <button
            aria-pressed={page === "sounds"}
            onClick={() => setPage("sounds")}
          >
            Sounds
          </button>
        </nav>
      </footer>
    </div>
  );
}
export type { Pad };
