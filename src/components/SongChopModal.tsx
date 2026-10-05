import { useCallback, useEffect, useMemo, useState } from "react";
import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../workers/workerClient";
import { mixToMono, snapToAttack, type SongAnalysis } from "../audio/song/beats";
import { barsBefore, gridStart, planSections, SECTION_BARS, sectionSeconds, settleCut } from "../audio/song/chop";
import { buildPyramid } from "../audio/song/waveform";
import { NOTE_NAMES } from "../audio/theory";
import { ChopTimeline } from "./ChopTimeline";
import type { Pad } from "./PadPanel";

export interface ChopSettings {
  bpm: number;
  beatsPerBar: number;
  /** Frame of bar 1 beat 1. */
  downbeatFrame: number;
  /** Cuts moved by hand: frames from where the grid puts each section's start, by section number (0-based). */
  shifts: Record<number, number>;
  /** Bars in the sections that are not 8, by section number (0-based): where the song drops or adds bars. */
  bars: Record<number, number>;
  /** The key to tune the project to, or null to leave the project's key alone. */
  keyPc: number | null;
}

const MIN_BPM = 30;
const MAX_BPM = 300;

function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  return `${sign}${m}:${(abs - m * 60).toFixed(3).padStart(6, "0")}`;
}

/**
 * Sets up chopping a song into 8-bar sections: the tempo, bar 1 and key are found from the audio and shown as suggestions the
 * user checks against the waveform. The whole song is drawn at full quality in the OLED's colours with a pointed tab at every cut;
 * a tab is dragged into place (down to zoom in, see ChopTimeline). Nothing is cut until Chop is pressed, because the cuts are
 * rendered into files and cannot be corrected afterwards.
 */
export function SongChopModal({
  pad,
  beatsPerBar: projectBeatsPerBar,
  freeSlots,
  onConfirm,
  onClose,
}: {
  pad: Pad;
  /** The project's time signature numerator. */
  beatsPerBar: number;
  freeSlots: number;
  onConfirm: (settings: ChopSettings) => void;
  onClose: () => void;
}) {
  const sampleRate = pad.sampleRate;
  const totalFrames = pad.channelData[0].length;
  const pyramid = useMemo(() => buildPyramid(pad.channelData), [pad.channelData]);
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  const [status, setStatus] = useState<"listening" | "done" | "failed">("listening");
  const [bpm, setBpm] = useState(120);
  const [bpmText, setBpmText] = useState("120");
  const [beatsPerBar, setBeatsPerBar] = useState(projectBeatsPerBar);
  const [downbeatFrame, setDownbeatFrame] = useState(0);
  const [shifts, setShifts] = useState<Record<number, number>>({});
  const [bars, setBars] = useState<Record<number, number>>({});
  /** What the last drag did to the song's structure, for the readout. */
  const [structureNote, setStructureNote] = useState("");
  const [selected, setSelected] = useState(0);
  const [keyPc, setKeyPc] = useState(0);
  const [minor, setMinor] = useState(false);
  const [useKey, setUseKey] = useState(true);

  const applyBpm = useCallback((value: number) => {
    const next = Math.min(MAX_BPM, Math.max(MIN_BPM, value));
    setBpm(next);
    setBpmText(String(Math.round(next * 1000) / 1000));
  }, []);

  useEffect(() => {
    let alive = true;
    const mono = mixToMono(pad.channelData);
    nextAnalysisWorker()
      .analyzeSong(Comlink.transfer(mono, [mono.buffer]), sampleRate, projectBeatsPerBar)
      .then((result) => {
        if (!alive) return;
        if (!result) return setStatus("failed");
        setAnalysis(result);
        applyBpm(result.bpm);
        setDownbeatFrame(Math.round(result.downbeatSeconds * sampleRate));
        setKeyPc(result.key.pc);
        setMinor(result.key.minor);
        setStatus("done");
      })
      .catch(() => alive && setStatus("failed"));
    return () => {
      alive = false;
    };
    // the analysis runs once, for the song as it was opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grid = useMemo(() => ({ bpm, beatsPerBar, downbeatFrame, sampleRate, shifts, bars }), [bpm, beatsPerBar, downbeatFrame, sampleRate, shifts, bars]);
  const plans = useMemo(() => planSections(totalFrames, grid), [totalFrames, grid]);
  const cuts = useMemo(() => plans.map((p) => p.start), [plans]);
  const fits = Math.min(plans.length, freeSlots);
  const chosen = Math.min(selected, Math.max(0, plans.length - 1));
  const plan = plans[chosen];
  const adjusted = Object.values(shifts).filter((s) => s !== 0).length;
  const beatFrames = (60 * sampleRate) / bpm;

  /** Puts the cut at position `at` on a frame: bar 1 moves the whole grid, any other cut moves alone. */
  const placeCut = useCallback(
    (at: number, frame: number) => {
      const target = plans[at];
      if (!target) return;
      const clamped = Math.min(totalFrames, Math.max(0, Math.round(frame)));
      if (target.index === 0) setDownbeatFrame(clamped);
      else setShifts((prev) => ({ ...prev, [target.index]: clamped - gridStart({ bpm, beatsPerBar, downbeatFrame, sampleRate, bars }, target.index) }));
      setStructureNote("");
    },
    [plans, totalFrames, bpm, beatsPerBar, downbeatFrame, sampleRate, bars],
  );

  /**
   * A tab was let go. A cut that landed almost exactly whole bars from the grid means the song has fewer (or more) bars there: the section before
   * it is that many bars shorter, and the cuts after it move with it (see settleCut).
   */
  const releaseCut = useCallback(
    (at: number) => {
      const target = plans[at];
      if (!target || target.index < 1) return;
      const edit = settleCut(grid, target.index, target.start);
      if (edit.barChange === 0) return;
      setShifts(edit.shifts);
      setBars(edit.bars);
      const now = edit.bars[target.index - 1] ?? SECTION_BARS;
      setStructureNote(`Section ${at} is now ${now} bar${now === 1 ? "" : "s"}${edit.barChange < 0 ? ": a bar was missing here" : ""}. The cuts after it moved with it.`);
    },
    [plans, grid],
  );

  const nudge = (frames: number) => plan && placeCut(chosen, plan.start + frames);
  const nudgeMs = (ms: number) => nudge(Math.round((ms * sampleRate) / 1000));

  /** Moves the chosen cut onto the sharpest rise in loudness within 30 ms. */
  const snap = () => {
    if (!plan) return;
    const radius = Math.round(0.03 * sampleRate);
    const from = Math.max(0, plan.start - radius - 16);
    const to = Math.min(totalFrames, plan.start + radius + 16);
    const slice = mixToMono(pad.channelData.map((d) => d.subarray(from, to)));
    placeCut(chosen, from + snapToAttack(slice, plan.start - from, radius));
  };

  /** With this cut where the user put it, the tempo that puts every cut on the grid through bar 1 and this cut. */
  const fitTempo = () => {
    if (!plan || plan.index < 1 || plan.start <= downbeatFrame) return;
    const framesPerBar = (plan.start - downbeatFrame) / barsBefore(grid, plan.index);
    applyBpm((beatsPerBar * 60 * sampleRate) / framesPerBar);
    setShifts((prev) => {
      const { [plan.index]: _gone, ...rest } = prev;
      return rest;
    });
  };

  const confidenceNote = !analysis
    ? null
    : Math.min(analysis.confidence.tempo, analysis.confidence.grid) < 0.4
      ? "The tempo is uncertain: check the cuts sit on the beats at both ends."
      : analysis.confidence.downbeat < 0.4
        ? "Which beat is beat 1 is a guess: check cut 1 against the music."
        : null;

  const shiftMs = plan && plan.index > 0 ? ((shifts[plan.index] ?? 0) / sampleRate) * 1000 : 0;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="chop" role="dialog" aria-label="Chop song to patterns" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>Chop to patterns</span>
          <button onClick={onClose} aria-label="Close">
            X
          </button>
        </div>
        <div className="chop__scroll">
          <p className="chop__note">
            {status === "listening" && "Listening for the tempo, bar 1 and key..."}
            {status === "failed" && "No steady beat found. Set the tempo and place the cuts by hand."}
            {status === "done" && (confidenceNote ?? "Found them. Grab a tab and drag down to zoom in, then place it on the beat.")}
          </p>

          <ChopTimeline
            pyramid={pyramid}
            sampleRate={sampleRate}
            cuts={cuts}
            selected={chosen}
            gridOrigin={downbeatFrame}
            beatFrames={beatFrames}
            beatsPerBar={beatsPerBar}
            onMoveCut={placeCut}
            onReleaseCut={releaseCut}
            onSelect={setSelected}
          />

          {structureNote && <p className="chop__note">{structureNote}</p>}
          {plan && (
            <div className="chop__readout">
              <span>
                Cut {chosen + 1} at {formatTime(plan.start / sampleRate)}
              </span>
              <span>{plan.index > 0 ? (shiftMs === 0 ? "On the grid" : `${shiftMs > 0 ? "+" : ""}${shiftMs.toFixed(1)} ms from the grid`) : "Bar 1: moves the grid"}</span>
            </div>
          )}

          <div className="chop__row">
            <button className="chop__btn" onClick={() => nudgeMs(-10)}>
              -10 ms
            </button>
            <button className="chop__btn" onClick={() => nudge(-1)}>
              -1
            </button>
            <button className="chop__btn" onClick={() => nudge(1)}>
              +1
            </button>
            <button className="chop__btn" onClick={() => nudgeMs(10)}>
              +10 ms
            </button>
            <button className="chop__btn" onClick={snap}>
              Snap
            </button>
          </div>
          <div className="chop__row">
            <button className="chop__btn" disabled={!plan || plan.index < 1} onClick={fitTempo} title="Sets the tempo so that every cut lines up with bar 1 and this cut">
              Fit tempo to this cut
            </button>
            <button
              className="chop__btn"
              disabled={!plan || plan.index < 1 || ((shifts[plan.index] ?? 0) === 0 && bars[plan.index - 1] === undefined)}
              onClick={() => {
                if (!plan) return;
                setShifts((prev) => ({ ...prev, [plan.index]: 0 }));
                setBars((prev) => {
                  const { [plan.index - 1]: _gone, ...rest } = prev;
                  return rest;
                });
                setStructureNote("");
              }}
            >
              Reset cut
            </button>
          </div>

          <div className="chop__row">
            <label>
              Tempo
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={MIN_BPM}
                max={MAX_BPM}
                value={bpmText}
                onChange={(e) => {
                  setBpmText(e.target.value);
                  const value = parseFloat(e.target.value);
                  if (Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM) setBpm(value);
                }}
                onBlur={() => setBpmText(String(Math.round(bpm * 1000) / 1000))}
              />
            </label>
            <button className="chop__btn" onClick={() => applyBpm(bpm / 2)}>
              ÷2
            </button>
            <button className="chop__btn" onClick={() => applyBpm(bpm * 2)}>
              ×2
            </button>
            <label>
              Beats per bar
              <input type="number" min={1} max={16} step={1} value={beatsPerBar} onChange={(e) => setBeatsPerBar(Math.min(16, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
            </label>
          </div>

          <div className="chop__row">
            <label className="chop__check">
              <input type="checkbox" checked={useKey} onChange={(e) => setUseKey(e.target.checked)} />
              Tune the project to the song's key
            </label>
          </div>
          <div className="chop__row">
            <select value={keyPc} onChange={(e) => setKeyPc(Number(e.target.value))} aria-label="Key">
              {NOTE_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select value={minor ? "minor" : "major"} onChange={(e) => setMinor(e.target.value === "minor")} aria-label="Major or minor">
              <option value="major">major</option>
              <option value="minor">minor</option>
            </select>
          </div>

          <p className="chop__note">
            {plans.length} section{plans.length === 1 ? "" : "s"} of {SECTION_BARS} bars ({sectionSeconds(bpm, beatsPerBar).toFixed(2)} s each).
            {plans.some((p) => p.bars !== SECTION_BARS) ? ` Not 8 bars: ${plans.filter((p) => p.bars !== SECTION_BARS).map((p) => `section ${plans.indexOf(p) + 1} (${p.bars})`).join(", ")}.` : ""}
            {adjusted > 0 ? ` ${adjusted} cut${adjusted === 1 ? " was" : "s were"} placed by hand.` : ""}
            {plans.length > 0 && plans[plans.length - 1].audioFrames < plans[plans.length - 1].length ? " The last one is padded with silence to a full 8 bars." : ""}
            {plans.length > fits ? ` Only ${fits} fit on free pads: the last ${plans.length - fits} are dropped.` : ""} The song's own pad is replaced by the sections, and the project tempo becomes {bpm.toFixed(2)} BPM.
          </p>
        </div>

        <button
          className="chop__go"
          disabled={status === "listening" || plans.length === 0 || fits === 0}
          onClick={() => {
            onConfirm({ bpm, beatsPerBar, downbeatFrame, shifts, bars, keyPc: useKey ? keyPc : null });
          }}
        >
          Chop into {fits} pattern{fits === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
