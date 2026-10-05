import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../workers/workerClient";
import type { Palette } from "../audio/palettes";
import { mixToMono, snapToAttack } from "../audio/song/beats";
import type { SectionPlan } from "../audio/song/chop";
import {
  barLineNear,
  barsIn,
  baseGrid,
  chopLines,
  commit,
  gridWithMarks,
  markerAt,
  NO_MARKS,
  redo,
  sectionsBetween,
  startHistory,
  tooLong,
  undo,
  type Marks,
} from "../audio/song/chopMarks";
import { bpmAt, isBarLine, lineFrame, linesBetween, MAX_SECTION_BARS, planSections, type TapGrid } from "../audio/song/tapGrid";
import { buildPyramid } from "../audio/song/waveform";
import { NOTE_NAMES } from "../audio/theory";
import { ChopTimeline, type ChopTimelineHandle } from "./ChopTimeline";
import { Knob } from "./Knob";
import { useSongPlayer } from "./useSongPlayer";
import type { Pad } from "./PadPanel";

export interface ChopSettings {
  /** The tempo of the grid where the first section starts: the project tempo the export writes. */
  bpm: number;
  beatsPerBar: number;
  /** The sections, on the song's own frames. */
  plans: SectionPlan[];
  /** The key to tune the project to, or null to leave the project's key alone. */
  keyPc: number | null;
}

/** What the automatic detection found: the tempo and where bar 1 starts. */
interface Detected {
  bpm: number;
  downbeatSeconds: number;
}

/** Where a downbeat marker looks for the sound's real attack, either side of the cursor (seconds). */
const ATTACK_RADIUS_S = 0.02;

/** A length in bars for the list: whole bars as a whole number, otherwise to two places. */
const barsText = (bars: number) => {
  const shown = +bars.toFixed(2);
  return `${shown} bar${shown === 1 ? "" : "s"}`;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(2).padStart(5, "0")}`;
}

/**
 * Chops a song into sections. The beat is found automatically; the waveform scrolls under a line in the middle of the screen (the cursor) and the song
 * plays from there with a click on every beat. **Chop marker** puts a cut at the cursor (on the nearest bar line); the bars between neighbouring cuts
 * are the sections. **Downbeat marker** says a bar starts at the cursor, which locks the grid back in where the detection has drifted. Pressing either
 * where one already is takes it away; undo and redo step through everything placed. Nothing is cut until Chop is pressed, because the cuts are
 * rendered into files and cannot be corrected afterwards. The cuts are found on the song, and made on its vocal stem.
 *
 * Every line of text sits in a slot of fixed size, and the panel has a fixed height, so nothing moves or resizes while a finger is on the waveform.
 */
export function SongChopModal({
  pad,
  palette,
  beatsPerBar,
  freeSlots,
  onConfirm,
  onClose,
}: {
  /** The song: the cuts are found on it. */
  pad: Pad;
  /** The selected colour palette: sections take its colours in turn. */
  palette: Palette;
  /** The project's time signature numerator. */
  beatsPerBar: number;
  freeSlots: number;
  onConfirm: (settings: ChopSettings) => void;
  onClose: () => void;
}) {
  const sampleRate = pad.sampleRate;
  const totalFrames = pad.channelData[0].length;
  const pyramid = useMemo(() => buildPyramid(pad.channelData), [pad.channelData]);
  const mono = useMemo(() => mixToMono(pad.channelData), [pad.channelData]);
  const timeline = useRef<ChopTimelineHandle>(null);
  const colorOf = (i: number) => palette.colors[i % palette.colors.length];

  const [detected, setDetected] = useState<Detected | "none" | null>(null);
  const [history, setHistory] = useState(() => startHistory<Marks>(NO_MARKS));
  const marks = history.present;
  /** What the last press did, for the readout. */
  const [status, setStatus] = useState("");
  /** Whether scrubbing pulls the line onto grid lines and markers; off, to place a marker exactly where the sound is. */
  const [magnetOn, setMagnetOn] = useState(true);

  const [keyPc, setKeyPc] = useState(0);
  const [minor, setMinor] = useState(false);
  const [useKey, setUseKey] = useState(true);
  const [keyReady, setKeyReady] = useState(false);

  // The song's tempo, bar 1 and key are found in the background.
  useEffect(() => {
    let alive = true;
    const copy = mixToMono(pad.channelData);
    nextAnalysisWorker()
      .analyzeSong(Comlink.transfer(copy, [copy.buffer]), sampleRate, beatsPerBar)
      .then((result) => {
        if (!alive) return;
        if (!result) return setDetected("none");
        setDetected({ bpm: result.bpm, downbeatSeconds: result.downbeatSeconds });
        setKeyPc(result.key.pc);
        setMinor(result.key.minor);
        setKeyReady(true);
      })
      .catch(() => alive && setDetected("none"));
    return () => {
      alive = false;
    };
    // the analysis runs once, for the song as it was opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The detected grid, or a plain 120 BPM one when no beat could be found (the downbeat markers then do the work). */
  const base = useMemo<TapGrid | null>(() => {
    if (detected === null) return null;
    return detected === "none" ? baseGrid(sampleRate, beatsPerBar, 120, 0) : baseGrid(sampleRate, beatsPerBar, detected.bpm, detected.downbeatSeconds);
  }, [detected, sampleRate, beatsPerBar]);
  const grid = useMemo(() => (base ? gridWithMarks(base, marks) : null), [base, marks]);

  // The 1.1.1 is the first chop marker: a chop before it does not count.
  const lines = useMemo(() => {
    if (!grid) return [];
    const first = marks.oneOne === null ? null : barLineNear(grid, marks.oneOne);
    return chopLines(grid, marks.chops).filter((n) => first === null || n >= first);
  }, [grid, marks.chops, marks.oneOne]);
  const sections = useMemo(() => sectionsBetween(lines), [lines]);
  const plans = useMemo(() => (grid ? planSections(totalFrames, grid, sections) : []), [grid, totalFrames, sections]);
  const fits = Math.min(plans.length, freeSlots);
  const longOnes = grid ? sections.map((s, i) => (tooLong(grid, s) ? i + 1 : 0)).filter(Boolean) : [];
  const tempo = grid ? bpmAt(grid, sections.length > 0 ? sections[0].first : 0) : 0;

  const gridRef = useRef(grid);
  gridRef.current = grid;
  const clickLines = useCallback((from: number, to: number) => {
    const g = gridRef.current;
    if (!g) return [];
    return linesBetween(g, from, to).map((n) => ({ frame: lineFrame(g, n), bar: isBarLine(g, n) }));
  }, []);
  const player = useSongPlayer(pad.channelData, sampleRate, clickLines);

  // While the song plays the waveform scrolls under the cursor.
  const { playing, frameNow } = player;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      const frame = frameNow();
      if (frame !== null) {
        timeline.current?.setCursor(frame);
        if (frame >= totalFrames) return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, frameNow, totalFrames]);

  const togglePlay = () => {
    if (player.playing) return player.stop();
    player.start(timeline.current?.cursor() ?? 0);
  };

  /** Jumps the line `bars` bars back or forward (`direction` -1 or 1) along the bar lines, and carries on playing from there if the song was playing. */
  const jump = (direction: number, bars: number) => {
    if (!grid) return;
    const cursor = timeline.current?.cursor() ?? 0;
    const near = barLineNear(grid, cursor);
    const nearFrame = lineFrame(grid, near);
    // From a bar line, the whole distance; from between two, the bar line already ahead in that direction counts as the first.
    const onLine = Math.abs(nearFrame - cursor) < grid.segments[0].beatFrames / 8;
    const ahead = !onLine && (direction > 0 ? nearFrame > cursor : nearFrame < cursor);
    const line = near + direction * grid.beatsPerBar * (ahead ? bars - 1 : bars);
    const frame = Math.min(totalFrames, Math.max(0, lineFrame(grid, line)));
    timeline.current?.setCursor(frame);
    if (player.playing) player.start(frame);
  };

  // ---- markers ----

  /** The sharpest attack in the audio near a frame, or the frame itself where there is none. */
  const attackNear = (frame: number) => {
    const radius = Math.round(ATTACK_RADIUS_S * sampleRate);
    const from = Math.max(0, Math.round(frame) - radius - 16);
    const to = Math.min(totalFrames, Math.round(frame) + radius + 16);
    if (to - from < 40) return Math.round(frame);
    return from + snapToAttack(mono.subarray(from, to), Math.round(frame) - from, radius);
  };

  const change = (next: Marks, message: string) => {
    setHistory((h) => commit(h, next));
    setStatus(message);
  };

  const addChop = () => {
    if (!grid) return;
    const cursor = timeline.current?.cursor() ?? 0;
    const line = barLineNear(grid, cursor);
    const at = lineFrame(grid, line);
    if (marks.oneOne !== null && line < barLineNear(grid, marks.oneOne)) return setStatus("The 1.1.1 is the first chop: nothing before it");
    const there = marks.chops.find((f) => barLineNear(grid, f) === line);
    if (there !== undefined) return change({ ...marks, chops: marks.chops.filter((f) => f !== there) }, `Chop removed at ${formatTime(at / sampleRate)}`);
    change({ ...marks, chops: [...marks.chops, cursor] }, `Chop added at ${formatTime(at / sampleRate)}`);
  };

  const addDownbeat = () => {
    if (!grid) return;
    const cursor = timeline.current?.cursor() ?? 0;
    const beat = grid.segments[0].beatFrames;
    const there = markerAt(marks.downbeats, cursor, beat / 4);
    if (there !== null) return change({ ...marks, downbeats: marks.downbeats.filter((f) => f !== there) }, `Downbeat removed at ${formatTime(there / sampleRate)}`);
    const frame = attackNear(cursor);
    change({ ...marks, downbeats: [...marks.downbeats, frame] }, `Downbeat added at ${formatTime(frame / sampleRate)}`);
  };

  const scaleTempo = (factor: number) => change({ ...marks, tempoScale: marks.tempoScale * factor }, factor > 1 ? "Tempo doubled" : "Tempo halved");

  /** The 1.1.1 is also the first chop marker: it is put there as the chop is, and goes and moves with it. */
  const addOneOne = () => {
    if (!grid) return;
    const cursor = timeline.current?.cursor() ?? 0;
    const old = marks.oneOne;
    const others = old === null ? marks.chops : marks.chops.filter((f) => f !== old);
    if (old !== null && Math.abs(old - cursor) <= grid.segments[0].beatFrames / 4) return change({ ...marks, oneOne: null, chops: others }, "1.1.1 removed");
    const frame = attackNear(cursor);
    change({ ...marks, oneOne: frame, chops: [...others, frame] }, `1.1.1 and chop set at ${formatTime(frame / sampleRate)}`);
  };

  const stepHistory = (step: typeof undo, message: string) => {
    setHistory(step);
    setStatus(message);
  };

  // ---- what is on show ----

  const drawnSections = grid ? sections.map((s, i) => ({ start: lineFrame(grid, s.first), end: lineFrame(grid, s.last), color: colorOf(i) })) : [];
  const chopFrames = grid ? lines.map((n) => lineFrame(grid, n)) : [];
  
  const note = "Scroll the waveform to a cut and add a chop. A downbeat marker locks the grid in where it drifts; 1.1.1 sets bar 1.";
  const bpmText = detected === null ? "Finding the beat..." : detected === "none" && marks.downbeats.length === 0 && marks.oneOne === null ? "No beat found" : `${(grid ? bpmAt(grid, 0) : 0).toFixed(2)} BPM`;
  const readoutTwo = status || `${lines.length} chop${lines.length === 1 ? "" : "s"}, ${marks.downbeats.length} downbeat${marks.downbeats.length === 1 ? "" : "s"}`;

  return (
    <div className="palette-backdrop chop-backdrop" onClick={onClose}>
      <div className="chop" role="dialog" aria-label="Chop song to patterns" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>
            Chop the song<span className="chop__version">v{__APP_VERSION__}</span>
          </span>
          <button onClick={onClose} aria-label="Close">
            X
          </button>
        </div>
        <div className="chop__scroll">
          <p className="chop__note">{note}</p>

          <div className="chop__screen">
            <ChopTimeline ref={timeline} pyramid={pyramid} sampleRate={sampleRate} grid={grid} chops={chopFrames} downbeats={[...marks.downbeats]} oneOne={marks.oneOne} sections={drawnSections} magnetOn={magnetOn} onScrub={player.stop} />
            <div className="chop__readout">
              <span>{bpmText}</span>
              <span>{readoutTwo}</span>
            </div>
          </div>

          <div className="chop__row">
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => scaleTempo(0.5)} title="Half the tempo: the grid has a line for every two of its beats" aria-label="Half the tempo">
              ÷2
            </button>
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => scaleTempo(2)} title="Double the tempo: the grid has two lines for every one of its beats" aria-label="Double the tempo">
              ×2
            </button>
            <button className="chop__btn chop__grow" aria-pressed={magnetOn} onClick={() => setMagnetOn((on) => !on)} title="When you let go, lets the line glide onto the nearest bar line (every fourth bar when zoomed out). Turn it off to place a marker exactly where the sound is.">
              Snap {magnetOn ? "on" : "off"}
            </button>
          </div>

          <div className="chop__row chop__transport">
            <button className={`chop__play${player.playing ? " chop__play--on" : ""}`} onClick={togglePlay} aria-pressed={player.playing} aria-label={player.playing ? "Pause" : "Play from the line"}>
              <span className="chop__play-icon">{player.playing ? "❚❚" : "▶"}</span>
              <span>{player.playing ? "Pause" : "Play"}</span>
            </button>
            <Knob value={player.clickVolume} onChange={player.setClickVolume} label="Click" />
            <div className="chop__jumps">
              <button className="chop__btn" disabled={!grid} onClick={() => jump(-1, 1)} aria-label="Back one bar">
                ◀ 1
              </button>
              <button className="chop__btn" disabled={!grid} onClick={() => jump(1, 1)} aria-label="Forward one bar">
                1 ▶
              </button>
              <button className="chop__btn" disabled={!grid} onClick={() => jump(-1, 4)} aria-label="Back four bars">
                ◀ 4
              </button>
              <button className="chop__btn" disabled={!grid} onClick={() => jump(1, 4)} aria-label="Forward four bars">
                4 ▶
              </button>
            </div>
          </div>

          <div className="chop__row chop__markers">
            <button className="chop__btn chop__grow" disabled={!grid} onClick={addChop} title="Puts a cut at the line, on the nearest bar line. On a cut already there it takes it away.">
              Chop marker
            </button>
            <button className="chop__btn chop__grow" disabled={!grid} onClick={addDownbeat} title="Says a bar starts at the line, and locks the grid to it from there on. On a marker already there it takes it away.">
              Downbeat marker
            </button>
            <button className="chop__btn chop__grow" disabled={!grid} onClick={addOneOne} title="Sets where the song's bars are counted from. It can be before the first downbeat marker. On the 1.1.1 already there it takes it away.">
              1.1.1
            </button>
          </div>
          <div className="chop__row">
            <button className="chop__btn chop__grow" disabled={history.past.length === 0} onClick={() => stepHistory(undo, "Undone")}>
              Undo
            </button>
            <button className="chop__btn chop__grow" disabled={history.future.length === 0} onClick={() => stepHistory(redo, "Redone")}>
              Redo
            </button>
          </div>

          <div className="chop__bin" aria-label="Sections">
            {sections.length === 0 || !grid ? (
              <p className="chop__bin-empty">No sections yet. Add a chop marker where one starts and another where it ends.</p>
            ) : (
              sections.map((s, i) => (
                <div key={s.first} className="chop__bin-row">
                  <button className="chop__bin-main" onClick={() => timeline.current?.setCursor(lineFrame(grid, s.first))}>
                    <span className="chop__bin-swatch" style={{ background: colorOf(i) }} />
                    <span>Section {i + 1}</span>
                    <span className="chop__bin-bars">{tooLong(grid, s) ? `${barsText(barsIn(grid, s))}, max ${MAX_SECTION_BARS}` : barsText(barsIn(grid, s))}</span>
                  </button>
                </div>
              ))
            )}
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
          {!keyReady && detected === null ? <p className="chop__note chop__note--summary">Listening for the key...</p> : null}
        </div>

        <button className="chop__go" disabled={plans.length === 0 || fits === 0 || longOnes.length > 0} onClick={() => grid && onConfirm({ bpm: tempo, beatsPerBar, plans, keyPc: useKey ? keyPc : null })}>
          Chop into {fits} pattern{fits === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
