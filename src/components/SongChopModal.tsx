import { useCallback, useEffect, useMemo, useState } from "react";
import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../workers/workerClient";
import { mixToMono, snapToAttack, type SongAnalysis } from "../audio/song/beats";
import { cutFrame, effectiveBpm, planSections, SECTION_BARS, sectionSeconds, settleCut, withoutAnchor } from "../audio/song/chop";
import { buildPyramid } from "../audio/song/waveform";
import { NOTE_NAMES } from "../audio/theory";
import { ChopTimeline } from "./ChopTimeline";
import type { Pad } from "./PadPanel";

export interface ChopSettings {
  /** The tempo the grid starts from; the tempo the cuts settle on is worked out from this and the cuts placed (see `effectiveBpm`). */
  bpm: number;
  beatsPerBar: number;
  /** Frame of bar 1 beat 1, in the song. */
  downbeatFrame: number;
  /** Cuts placed by hand: the frame each was put on, by section number (0-based). */
  anchors: Record<number, number>;
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
 * Sets up chopping a song into sections: the tempo, bar 1 and key are found from the song and shown as suggestions the user checks against its
 * waveform. The whole song is drawn at full quality in the OLED's colours with a pointed tab at every cut; a tab is dragged into place (see
 * ChopTimeline), and every cut placed by hand refines the grid for the cuts after it. Nothing is cut until Chop is pressed, because the
 * cuts are rendered into files and cannot be corrected afterwards. The cuts are found on the song, and made on its vocal stem.
 *
 * Every line of text sits in a slot of fixed size, and the panel has a fixed height, so nothing moves or resizes while a finger is dragging.
 */
export function SongChopModal({
  pad,
  vocalsName,
  beatsPerBar: projectBeatsPerBar,
  freeSlots,
  onConfirm,
  onClose,
}: {
  /** The song: the cuts are found on it. */
  pad: Pad;
  /** The vocal stem the sections are cut from, for the summary. */
  vocalsName: string;
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
  const [anchors, setAnchors] = useState<Record<number, number>>({});
  const [bars, setBars] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState(0);
  /** What the last drag did to the song's structure, shown in the note slot. */
  const [structureNote, setStructureNote] = useState("");
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

  const grid = useMemo(() => ({ bpm, beatsPerBar, downbeatFrame, sampleRate, anchors, bars }), [bpm, beatsPerBar, downbeatFrame, sampleRate, anchors, bars]);
  const plans = useMemo(() => planSections(totalFrames, grid), [totalFrames, grid]);
  const cuts = useMemo(() => plans.map((p) => p.start), [plans]);
  const fits = Math.min(plans.length, freeSlots);
  const chosen = Math.min(selected, Math.max(0, plans.length - 1));
  const plan = plans[chosen];
  const placed = Object.keys(anchors).length;
  /** Once a cut has been placed by hand the tempo comes from the cuts, not from the box. */
  const derived = placed > 0;
  const tempo = effectiveBpm(grid);
  const beatFrames = (60 * sampleRate) / tempo;

  /** The beats of the grid between two frames: the first cut's bar forwards from each cut, so the lines follow the refined grid and the cuts. */
  const beatLines = useCallback(
    (from: number, to: number) => {
      const lines: { frame: number; bar: boolean }[] = [];
      plans.forEach((p, i) => {
        const next = plans[i + 1]?.start ?? Infinity;
        const end = Math.min(p.start + p.bars * beatsPerBar * beatFrames, next);
        if (p.start > to) return;
        if (i === 0) for (let n = -1; p.start + n * beatFrames >= from - beatFrames; n--) if (p.start + n * beatFrames >= from) lines.push({ frame: p.start + n * beatFrames, bar: ((n % beatsPerBar) + beatsPerBar) % beatsPerBar === 0 });
        if (end < from) return;
        for (let n = 0; p.start + n * beatFrames < end; n++) {
          const frame = p.start + n * beatFrames;
          if (frame > to) break;
          if (frame >= from) lines.push({ frame, bar: n % beatsPerBar === 0 });
        }
      });
      return lines;
    },
    [plans, beatsPerBar, beatFrames],
  );

  /** Puts the cut at position `at` on a frame: bar 1 starts the grid, any other cut is placed by hand and refines the grid after it. */
  const placeCut = useCallback(
    (at: number, frame: number) => {
      const target = plans[at];
      if (!target) return;
      const clamped = Math.min(totalFrames, Math.max(0, Math.round(frame)));
      if (target.index === 0) setDownbeatFrame(clamped);
      else setAnchors((prev) => ({ ...prev, [target.index]: clamped }));
      setStructureNote("");
    },
    [plans, totalFrames],
  );

  /**
   * A tab was let go. A cut that landed almost exactly whole bars from where the grid had it means the song has fewer (or more) bars there: the
   * section before it is that many bars shorter, and the cuts after it follow (see settleCut).
   */
  const releaseCut = useCallback(
    (at: number) => {
      const target = plans[at];
      if (!target || target.index < 1) return;
      const edit = settleCut(grid, target.index, target.start);
      if (edit.barChange === 0) return;
      setBars(edit.bars);
      const now = edit.bars[target.index - 1] ?? SECTION_BARS;
      setStructureNote(`Section ${at} is now ${now} bar${now === 1 ? "" : "s"}${edit.barChange < 0 ? ": a bar was missing here" : ""}. The cuts after it follow.`);
    },
    [plans, grid],
  );

  const nudge = (frames: number) => plan && placeCut(chosen, plan.start + frames);
  const nudgeMs = (ms: number) => nudge(Math.round((ms * sampleRate) / 1000));

  /** Takes the chosen cut off the hand-placed ones: it goes back to where the grid, as the other cuts refine it, puts it. */
  const snapToGrid = () => {
    if (!plan || plan.index < 1) return;
    setAnchors((prev) => withoutAnchor({ ...grid, anchors: prev }, plan.index).anchors as Record<number, number>);
    setStructureNote("");
  };

  /** Moves the chosen cut onto the sharpest rise in loudness within 30 ms (a drum hit, say). */
  const toTransient = () => {
    if (!plan) return;
    const radius = Math.round(0.03 * sampleRate);
    const from = Math.max(0, plan.start - radius - 16);
    const to = Math.min(totalFrames, plan.start + radius + 16);
    const slice = mixToMono(pad.channelData.map((d) => d.subarray(from, to)));
    placeCut(chosen, from + snapToAttack(slice, plan.start - from, radius));
  };

  const resetCut = () => {
    if (!plan || plan.index < 1) return;
    snapToGrid();
    setBars((prev) => {
      const { [plan.index - 1]: _gone, ...rest } = prev;
      return rest;
    });
  };

  const resetGrid = () => {
    setAnchors({});
    setBars({});
    setStructureNote("");
  };

  const confidenceNote = !analysis
    ? null
    : Math.min(analysis.confidence.tempo, analysis.confidence.grid) < 0.4
      ? "The tempo is uncertain: check the cuts sit on the beats at both ends."
      : analysis.confidence.downbeat < 0.4
        ? "Which beat is beat 1 is a guess: check cut 1 against the music."
        : null;
  const note =
    structureNote ||
    (status === "listening"
      ? "Listening for the tempo, bar 1 and key..."
      : status === "failed"
        ? "No steady beat found. Set the tempo and place the cuts by hand."
        : (confidenceNote ?? "Found them. Place cut 1 on the first downbeat, then each cut after it: the grid refines as you go."));

  const gridAt = plan && plan.index >= 1 ? cutFrame(withoutAnchor(grid, plan.index), plan.index) : null;
  const fromGridMs = plan && gridAt !== null ? ((plan.start - gridAt) / sampleRate) * 1000 : 0;
  const detail = !plan
    ? ""
    : plan.index === 0
      ? "Bar 1 starts the grid"
      : anchors[plan.index] === undefined
        ? "On the grid"
        : `By hand: ${fromGridMs >= 0 ? "+" : ""}${fromGridMs.toFixed(1)} ms`;

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
          <p className="chop__note">{note}</p>

          <ChopTimeline
            pyramid={pyramid}
            sampleRate={sampleRate}
            cuts={cuts}
            selected={chosen}
            beatFrames={beatFrames}
            beatLines={beatLines}
            onMoveCut={placeCut}
            onReleaseCut={releaseCut}
            onSelect={setSelected}
          />

          <div className="chop__readout">
            <span>{plan ? `Cut ${chosen + 1} at ${formatTime(plan.start / sampleRate)}` : ""}</span>
            <span>{detail}</span>
          </div>

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
          </div>
          <div className="chop__row">
            <button className="chop__btn" disabled={!plan || anchors[plan.index] === undefined} onClick={snapToGrid} title="Puts the cut back where the grid, refined by the other cuts, says it belongs">
              Snap to grid
            </button>
            <button className="chop__btn" disabled={!plan} onClick={toTransient} title="Moves the cut onto the nearest sharp rise in loudness">
              To transient
            </button>
            <button className="chop__btn" disabled={!plan || plan.index < 1 || (anchors[plan.index] === undefined && bars[plan.index - 1] === undefined)} onClick={resetCut}>
              Reset cut
            </button>
            <button className="chop__btn" disabled={placed === 0 && Object.keys(bars).length === 0} onClick={resetGrid}>
              Reset grid
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
                disabled={derived}
                value={derived ? String(Math.round(tempo * 1000) / 1000) : bpmText}
                onChange={(e) => {
                  setBpmText(e.target.value);
                  const value = parseFloat(e.target.value);
                  if (Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM) setBpm(value);
                }}
                onBlur={() => setBpmText(String(Math.round(bpm * 1000) / 1000))}
              />
            </label>
            <button className="chop__btn" disabled={derived} onClick={() => applyBpm(bpm / 2)}>
              ÷2
            </button>
            <button className="chop__btn" disabled={derived} onClick={() => applyBpm(bpm * 2)}>
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

          <p className="chop__note chop__note--summary">
            The cuts are made on the song and applied to "{vocalsName}". {plans.length} section{plans.length === 1 ? "" : "s"} of {SECTION_BARS} bars ({sectionSeconds(tempo, beatsPerBar).toFixed(2)} s each).
            {placed > 0 ? ` ${placed} cut${placed === 1 ? " was" : "s were"} placed by hand.` : ""}
            {plans.some((p) => p.bars !== SECTION_BARS) ? ` Not 8 bars: ${plans.filter((p) => p.bars !== SECTION_BARS).map((p) => `section ${plans.indexOf(p) + 1} (${p.bars})`).join(", ")}.` : ""}
            {plans.length > 0 && plans[plans.length - 1].audioFrames < plans[plans.length - 1].length ? " The last one is padded with silence to a full 8 bars." : ""}
            {plans.length > fits ? ` Only ${fits} fit on free pads: the last ${plans.length - fits} are dropped.` : ""} The vocal stem's own pad is replaced by the sections, and the project tempo becomes {tempo.toFixed(2)} BPM.
          </p>
        </div>

        <button
          className="chop__go"
          disabled={status === "listening" || plans.length === 0 || fits === 0}
          onClick={() => onConfirm({ bpm, beatsPerBar, downbeatFrame, anchors, bars, keyPc: useKey ? keyPc : null })}
        >
          Chop into {fits} pattern{fits === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
