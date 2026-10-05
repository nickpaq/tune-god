import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../workers/workerClient";
import { getAudioContext } from "../audio/decode";
import { mixToMono, snapToAttack } from "../audio/song/beats";
import type { SectionPlan } from "../audio/song/chop";
import { startMicTaps, type MicTaps } from "../audio/song/micTap";
import { addCuts, gridBpm, gridFromTaps, isBarLine, lineFrame, linesBetween, nudgeLine, oddSections, placeLine, planTapSections, resetLine, shiftGrid, toggleCut, type TapGrid } from "../audio/song/tapGrid";
import { estimateTempo, MIN_TAPS } from "../audio/song/tapTempo";
import { buildPyramid } from "../audio/song/waveform";
import { NOTE_NAMES } from "../audio/theory";
import { GridTimeline, type GridTimelineHandle, type TimelineMode } from "./GridTimeline";
import { useSongPlayer } from "./useSongPlayer";
import type { Pad } from "./PadPanel";

export interface ChopSettings {
  /** The tempo of the tapped grid: the project tempo the export writes. */
  bpm: number;
  beatsPerBar: number;
  /** The sections, on the song's own frames. */
  plans: SectionPlan[];
  /** The key to tune the project to, or null to leave the project's key alone. */
  keyPc: number | null;
}

function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  return `${sign}${m}:${(abs - m * 60).toFixed(3).padStart(6, "0")}`;
}

/** While tapping, nothing is picked yet, so the line nearest the start of the song stands for bar 1 (for the clicks). */
const estimateOrigin = (g: TapGrid): number => Math.round((0 - g.originFrame) / g.beatFrames);

/** A stand-in grid for the tapping stage before there is a tempo (nothing is drawn from it). */
const placeholderGrid = (sampleRate: number, beatsPerBar: number): TapGrid => ({ sampleRate, beatFrames: sampleRate / 2, originFrame: 0, beatsPerBar, offsets: {} });

const MODE_NOTES: Record<TimelineMode, string> = {
  view: "",
  pick: "Tap a grid line to cut there: the first is bar 1, then each split after it. Tap a cut again to take it away. Zoom with + and −.",
  adjust: "Tap a line that is off to choose it, then nudge it with the buttons. Lines you nudge move on their own.",
  drag: "Drag from one grid line to another to cut a section there in one go. The view runs on at the edges.",
};

/**
 * Chops a song into sections by tapping out its grid. First the song plays and the user taps along (a button, or knocks on the back of the phone
 * picked up by the microphone) until the tempo is locked in; a stray tap that the rhythm does not agree with is ignored. Then the grid is a line
 * for every beat over the waveform: tap a line to cut there (the first cut is bar 1, every one after it a split), drag across the waveform to cut a
 * section from one line to another, or choose a line that sits off the beat and nudge it. Nothing is cut until Chop is pressed, because the cuts
 * are rendered into files and cannot be corrected afterwards. The cuts are found on the song, and made on its vocal stem.
 *
 * Every line of text sits in a slot of fixed size, and the panel has a fixed height, so nothing moves or resizes while a finger is on the waveform.
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
  const timeline = useRef<GridTimelineHandle>(null);

  const [phase, setPhase] = useState<"tap" | "edit">("tap");
  const [beatsPerBar, setBeatsPerBar] = useState(projectBeatsPerBar);
  /** The times (seconds in the song) of the taps made, in the order they were made. */
  const [taps, setTaps] = useState<number[]>([]);
  const sorted = useMemo(() => [...taps].sort((a, b) => a - b), [taps]);
  const estimate = useMemo(() => estimateTempo(sorted), [sorted]);

  // The grid once it is locked in; the beats per bar can still be changed afterwards.
  const [locked, setLocked] = useState<TapGrid | null>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [mode, setMode] = useState<TimelineMode>("pick");
  const [wholeGrid, setWholeGrid] = useState(false);
  const [restOfSong, setRestOfSong] = useState(true);

  const [keyPc, setKeyPc] = useState(0);
  const [minor, setMinor] = useState(false);
  const [useKey, setUseKey] = useState(true);
  const [keyReady, setKeyReady] = useState(false);

  // The song's key is found in the background, as a suggestion; the tempo comes from the taps.
  useEffect(() => {
    let alive = true;
    const mono = mixToMono(pad.channelData);
    nextAnalysisWorker()
      .analyzeSong(Comlink.transfer(mono, [mono.buffer]), sampleRate, projectBeatsPerBar)
      .then((result) => {
        if (!alive || !result) return;
        setKeyPc(result.key.pc);
        setMinor(result.key.minor);
        setKeyReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // the analysis runs once, for the song as it was opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The grid on show: the locked one, or what the taps say so far, or none. */
  const grid = useMemo<TapGrid | null>(() => {
    if (phase === "edit" && locked) return { ...locked, beatsPerBar };
    return estimate ? gridFromTaps(estimate, sampleRate, beatsPerBar) : null;
  }, [phase, locked, estimate, sampleRate, beatsPerBar]);

  const gridRef = useRef({ grid, cuts });
  gridRef.current = { grid, cuts };
  const clickLines = useCallback((from: number, to: number) => {
    const { grid: g, cuts: picked } = gridRef.current;
    if (!g) return [];
    // The bar's first beat clicks higher, counting from the first cut once there is one.
    return linesBetween(g, from, to).map((n) => ({ frame: lineFrame(g, n), bar: isBarLine(g, n, picked[0] ?? estimateOrigin(g)) }));
  }, []);
  const player = useSongPlayer(pad.channelData, sampleRate, clickLines);

  // The playhead runs while the song plays, with the view following it.
  const { playing, frameNow } = player;
  useEffect(() => {
    if (!playing) {
      timeline.current?.setPlayhead(null, false);
      return;
    }
    let raf = 0;
    const step = () => {
      const frame = frameNow();
      if (frame !== null) {
        timeline.current?.setPlayhead(Math.min(totalFrames, Math.max(0, frame)), true);
        if (frame >= totalFrames) return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, frameNow, totalFrames]);

  // ---- tapping ----

  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(0);
  const registerTap = useCallback(
    (secondsAgo: number) => {
      const frame = player.frameAgo(secondsAgo);
      if (frame === null) return;
      setTaps((prev) => [...prev, frame / sampleRate]);
      setFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(false), 90);
    },
    [player, sampleRate],
  );
  const tapRef = useRef(registerTap);
  tapRef.current = registerTap;
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const onTapDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // The press waited in the browser's queue for a moment; the song has moved on by then.
    registerTap(Math.min(0.2, Math.max(0, (performance.now() - e.timeStamp) / 1000)));
  };

  // The microphone: a knock on the back of the phone, picked up as a tap.
  const mic = useRef<MicTaps | null>(null);
  const micLevel = useRef(0);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState("");
  const [sensitivity, setSensitivity] = useState(0.5);
  const [level, setLevel] = useState(0);
  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;

  const stopMic = useCallback(() => {
    mic.current?.stop();
    mic.current = null;
    setMicOn(false);
    setLevel(0);
  }, []);
  const toggleMic = async () => {
    if (mic.current) return stopMic();
    setMicError("");
    try {
      mic.current = await startMicTaps(
        getAudioContext(),
        sensitivityRef.current,
        (secondsAgo) => tapRef.current(secondsAgo),
        (peak) => {
          micLevel.current = Math.max(micLevel.current * 0.9, peak);
        },
      );
      setMicOn(true);
    } catch (err) {
      setMicError(err instanceof Error && err.name === "NotAllowedError" ? "The microphone is blocked: allow it in the browser's settings." : "No microphone found.");
    }
  };
  useEffect(() => mic.current?.setSensitivity(sensitivity), [sensitivity]);
  useEffect(() => {
    if (!micOn) return;
    const timer = window.setInterval(() => setLevel(micLevel.current), 80);
    return () => window.clearInterval(timer);
  }, [micOn]);
  useEffect(() => () => mic.current?.stop(), []);

  const play = () => {
    if (player.playing) return player.stop();
    const from = Math.max(0, timeline.current?.centre() ?? 0);
    // Playing from before the taps made means starting over: they belong to another run of the song.
    if (phase === "tap" && sorted.length > 0 && from / sampleRate < sorted[sorted.length - 1]) setTaps([]);
    player.start(from);
  };

  const lockGrid = () => {
    if (!estimate) return;
    player.stop();
    stopMic();
    timeline.current?.centreOn(estimate.accepted[0] * sampleRate);
    setLocked(gridFromTaps(estimate, sampleRate, beatsPerBar));
    setCuts([]);
    setSelectedLine(null);
    setMode("pick");
    setPhase("edit");
  };

  const tapAgain = () => {
    if (cuts.length > 0 && !window.confirm("Tapping again makes a new grid and clears the cuts you picked. Go back to tapping?")) return;
    player.stop();
    setPhase("tap");
  };

  // ---- editing the grid ----

  const edit = grid && phase === "edit";
  const setGridEdit = (next: TapGrid) => setLocked(next);

  const onLine = (n: number | null) => {
    setSelectedLine(n);
    if (n !== null && mode === "pick") setCuts((prev) => toggleCut(prev, n));
  };
  const onSpan = (first: number, last: number) => {
    setCuts((prev) => addCuts(prev, [first, last]));
    setSelectedLine(null);
  };

  const nudge = (frames: number) => {
    if (!grid || !edit) return;
    if (wholeGrid) return setGridEdit(shiftGrid(grid, frames));
    if (selectedLine !== null) setGridEdit(nudgeLine(grid, selectedLine, frames));
  };
  const nudgeMs = (ms: number) => nudge((ms * sampleRate) / 1000);

  /** Puts the chosen line on the sharpest rise in loudness within 30 ms of it (a drum hit, say). */
  const toTransient = () => {
    if (!grid || selectedLine === null) return;
    const at = lineFrame(grid, selectedLine);
    const radius = Math.round(0.03 * sampleRate);
    const from = Math.max(0, Math.round(at) - radius - 16);
    const to = Math.min(totalFrames, Math.round(at) + radius + 16);
    if (to - from < 32) return;
    const slice = mixToMono(pad.channelData.map((d) => d.subarray(from, to)));
    setGridEdit(placeLine(grid, selectedLine, from + snapToAttack(slice, Math.round(at) - from, radius)));
  };

  const nudged = grid && selectedLine !== null ? (grid.offsets[selectedLine] ?? 0) : 0;
  const selectedCut = selectedLine !== null ? cuts.indexOf(selectedLine) : -1;

  const plans = useMemo(() => (grid && edit ? planTapSections(totalFrames, grid, cuts, { restOfSong }) : []), [grid, edit, totalFrames, cuts, restOfSong]);
  const fits = Math.min(plans.length, freeSlots);
  const odd = grid && edit ? oddSections(grid, cuts) : [];
  const tempo = grid ? gridBpm(grid) : 0;

  const need = Math.max(0, MIN_TAPS - (estimate?.accepted.length ?? 0));
  const tapNote =
    taps.length === 0
      ? "Press play, then tap along to the beat with the big button, or on the back of the phone with the microphone on. Keep going until the tempo locks in."
      : !estimate
        ? "Keep tapping: it needs two taps to find a tempo."
        : estimate.locked
          ? "Locked in. A few more taps make it steadier, or lock the grid and pick the cuts."
          : need > 0
            ? `${need} more tap${need === 1 ? "" : "s"} before the grid can be locked. A stray tap is ignored if the rhythm carries on.`
            : "Nearly there: keep tapping along until it says locked in, or lock the grid now.";
  const note = phase === "tap" ? tapNote : MODE_NOTES[mode];

  const readoutOne =
    phase === "tap"
      ? estimate
        ? `${estimate.bpm.toFixed(1)} BPM from ${estimate.accepted.length} tap${estimate.accepted.length === 1 ? "" : "s"}`
        : `${taps.length} tap${taps.length === 1 ? "" : "s"}`
      : selectedLine === null
        ? `${tempo.toFixed(2)} BPM`
        : `Line ${selectedLine}${selectedCut >= 0 ? `, cut ${selectedCut + 1}` : ""} at ${formatTime(lineFrame(grid!, selectedLine) / sampleRate)}`;
  const readoutTwo =
    phase === "tap"
      ? estimate
        ? `${estimate.ignored.length} ignored${estimate.locked ? ", locked in" : ""}`
        : ""
      : selectedLine === null
        ? "No line chosen"
        : nudged === 0
          ? "On the grid"
          : `Moved ${nudged >= 0 ? "+" : ""}${((nudged / sampleRate) * 1000).toFixed(1)} ms`;

  const marks = useMemo(() => {
    if (phase !== "tap") return undefined;
    const ignored = new Set(estimate?.ignored ?? []);
    return taps.map((t) => ({ frame: t * sampleRate, ignored: ignored.has(t) }));
  }, [phase, taps, estimate, sampleRate]);
  const startFrame = sorted.length > 0 ? sorted[0] * sampleRate : (locked?.originFrame ?? 0);

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="chop" role="dialog" aria-label="Chop song to patterns" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>{phase === "tap" ? "Tap the tempo" : "Pick the cuts"}</span>
          <button onClick={onClose} aria-label="Close">
            X
          </button>
        </div>
        <div className="chop__scroll">
          <p className="chop__note">{note}</p>

          <GridTimeline
            ref={timeline}
            pyramid={pyramid}
            sampleRate={sampleRate}
            grid={grid ?? placeholderGrid(sampleRate, beatsPerBar)}
            showGrid={!!grid}
            cuts={edit ? cuts : []}
            tail={!!edit && restOfSong}
            selectedLine={edit ? selectedLine : null}
            mode={edit ? mode : "view"}
            taps={marks}
            startFrame={startFrame}
            onLine={onLine}
            onSpan={onSpan}
          />

          <div className="chop__readout">
            <span>{readoutOne}</span>
            <span>{readoutTwo}</span>
          </div>

          <div className="chop-timeline__play">
            <button className={`chop__play${player.playing ? " chop__play--on" : ""}`} onClick={play} aria-pressed={player.playing} aria-label="Play from the middle of the view">
              <span className="chop__play-icon">{player.playing ? "■" : "▶"}</span>
              <span>{player.playing ? "Stop" : "Play"}</span>
            </button>
            <button className="chop__btn chop__clicks" aria-pressed={player.clicks} onClick={() => player.setClicks((on) => !on)} title="A click on every line of the grid while it plays">
              Clicks {player.clicks ? "on" : "off"}
            </button>
          </div>

          {phase === "tap" ? (
            <>
              <button className={`chop__tap${flash ? " chop__tap--hit" : ""}`} onPointerDown={onTapDown} disabled={!player.playing} aria-label="Tap on the beat">
                {player.playing ? "Tap" : "Press play, then tap"}
              </button>
              <div className="chop__row">
                <button className="chop__btn chop__toggle" aria-pressed={micOn} onClick={toggleMic} title="Knock on the back of the phone instead of pressing the button: the microphone hears it">
                  Mic {micOn ? "on" : "off"}
                </button>
                <label className="chop__grow">
                  Sensitivity
                  <input type="range" min={0} max={1} step={0.01} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
                </label>
              </div>
              <div className="chop__row">
                <span className="chop__meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.sqrt(level) * 140)}%` }} />
                </span>
                <span className="chop__hint">{micError || (micOn ? "Knock close to the microphone. Headphones keep the song out of it." : "Mic off")}</span>
              </div>
              <div className="chop__row">
                <label>
                  Beats per bar
                  <input type="number" min={1} max={16} step={1} value={beatsPerBar} onChange={(e) => setBeatsPerBar(Math.min(16, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
                </label>
                <button className="chop__btn" disabled={taps.length === 0} onClick={() => setTaps([])}>
                  Clear taps
                </button>
              </div>
              <button className="chop__btn chop__wide" disabled={!estimate || estimate.accepted.length < MIN_TAPS} onClick={lockGrid}>
                Lock the grid
              </button>
            </>
          ) : (
            <>
              <div className="chop__row chop__modes">
                {(["pick", "adjust", "drag"] as const).map((m) => (
                  <button key={m} className="chop__btn chop__toggle" aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {m === "pick" ? "Pick cuts" : m === "adjust" ? "Adjust grid" : "Drag section"}
                  </button>
                ))}
              </div>
              {mode === "adjust" ? (
                <>
                  <div className="chop__row">
                    <button className="chop__btn" disabled={!wholeGrid && selectedLine === null} onClick={() => nudgeMs(-10)}>
                      -10 ms
                    </button>
                    <button className="chop__btn" disabled={!wholeGrid && selectedLine === null} onClick={() => nudge(-1)}>
                      -1
                    </button>
                    <button className="chop__btn" disabled={!wholeGrid && selectedLine === null} onClick={() => nudge(1)}>
                      +1
                    </button>
                    <button className="chop__btn" disabled={!wholeGrid && selectedLine === null} onClick={() => nudgeMs(10)}>
                      +10 ms
                    </button>
                  </div>
                  <div className="chop__row">
                    <button className="chop__btn chop__toggle" aria-pressed={wholeGrid} onClick={() => setWholeGrid((on) => !on)} title="On: the buttons move every line together, for a tap that always lands early or late">
                      Whole grid {wholeGrid ? "on" : "off"}
                    </button>
                    <button className="chop__btn" disabled={selectedLine === null || wholeGrid} onClick={toTransient} title="Moves the line onto the nearest sharp rise in loudness">
                      To transient
                    </button>
                    <button className="chop__btn" disabled={selectedLine === null || nudged === 0 || wholeGrid} onClick={() => grid && selectedLine !== null && setGridEdit(resetLine(grid, selectedLine))}>
                      Reset line
                    </button>
                  </div>
                </>
              ) : null}
              <div className="chop__row">
                <button className="chop__btn" disabled={cuts.length === 0} onClick={() => setCuts((prev) => prev.slice(0, -1))}>
                  Remove last cut
                </button>
                <button className="chop__btn" disabled={cuts.length === 0} onClick={() => setCuts([])}>
                  Clear cuts
                </button>
                <button className="chop__btn" onClick={tapAgain}>
                  Tap again
                </button>
              </div>
              <div className="chop__row">
                <label>
                  Beats per bar
                  <input type="number" min={1} max={16} step={1} value={beatsPerBar} onChange={(e) => setBeatsPerBar(Math.min(16, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
                </label>
                <label className="chop__check">
                  <input type="checkbox" checked={restOfSong} onChange={(e) => setRestOfSong(e.target.checked)} />
                  Rest of the song after the last cut
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
              {!keyReady ? <p className="chop__note chop__note--summary">Listening for the key...</p> : null}

              <p className="chop__note chop__note--summary">
                {cuts.length === 0
                  ? "No cuts yet: pick the line where bar 1 starts."
                  : `The cuts are made on the song and applied to "${vocalsName}". ${plans.length} section${plans.length === 1 ? "" : "s"} from ${cuts.length} cut${cuts.length === 1 ? "" : "s"}.`}
                {odd.length > 0 ? ` Not a whole number of bars: section ${odd.join(", ")}. It is cut where the lines are and held for the nearest whole bars.` : ""}
                {plans.length > fits ? ` Only ${fits} fit on free pads: the last ${plans.length - fits} are dropped.` : ""}
                {plans.length > 0 ? ` The vocal stem's own pad is replaced by the sections, and the project tempo becomes ${tempo.toFixed(2)} BPM.` : ""}
              </p>
            </>
          )}
        </div>

        {phase === "edit" ? (
          <button
            className="chop__go"
            disabled={plans.length === 0 || fits === 0}
            onClick={() => grid && onConfirm({ bpm: gridBpm(grid), beatsPerBar, plans, keyPc: useKey ? keyPc : null })}
          >
            Chop into {fits} pattern{fits === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
