import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../workers/workerClient";
import { getAudioContext } from "../audio/decode";
import type { Palette } from "../audio/palettes";
import { mixToMono, snapToAttack } from "../audio/song/beats";
import { attackEnvelope, findDriftMarkers } from "../audio/song/drift";
import type { SectionPlan } from "../audio/song/chop";
import { startMicTaps, type MicTaps } from "../audio/song/micTap";
import {
  bpmAt,
  gridFromTaps,
  inOrder,
  isBarLine,
  lineFrame,
  linesBetween,
  maxBeats,
  MAX_SECTION_BARS,
  nudgeLine,
  oddSections,
  placeLine,
  planSections,
  realignGrid,
  resetLine,
  setDownbeat,
  shiftGrid,
  type PickedSection,
  type TapGrid,
} from "../audio/song/tapGrid";
import { estimateTempo, MIN_TAPS, refineWithTransients } from "../audio/song/tapTempo";
import { buildPyramid } from "../audio/song/waveform";
import { NOTE_NAMES } from "../audio/theory";
import { GridTimeline, type GridTimelineHandle, type Selection } from "./GridTimeline";
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

function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  return `${sign}${m}:${(abs - m * 60).toFixed(3).padStart(6, "0")}`;
}

/** A stand-in grid for the tapping stage before there is a tempo (nothing is drawn from it). */
const placeholderGrid = (sampleRate: number, beatsPerBar: number): TapGrid => ({ sampleRate, beatsPerBar, segments: [{ line: 0, frame: 0, beatFrames: sampleRate / 2 }], offsets: {}, downbeats: [] });

const MODE_NOTES: Record<"select" | "adjust", string> = {
  select: "Drag to pick a section (16 bars max). Move the S and E tabs; double tap it to add it to the list.",
  adjust: "Tap a line that is off to choose it, then nudge it with the buttons. Lines you nudge move on their own.",
};

/** A length in bars for the list: whole bars as a whole number, otherwise to two places. */
const barsText = (beats: number, beatsPerBar: number) => {
  const bars = +(beats / beatsPerBar).toFixed(2);
  return `${bars} bar${bars === 1 ? "" : "s"}`;
};

/**
 * Chops a song into sections along a grid tapped out by hand. First the song plays and the user taps along (a button, or knocks on the back of the
 * phone picked up by the microphone) until the tempo is locked in; a stray tap that the rhythm does not agree with is ignored. Then the grid is a line for
 * every beat over the waveform and nothing is cut: the user sets 1.1.1 on a line (and again later in the song if the downbeat moves), drags across the
 * waveform to pick a section of up to 16 bars, moves its ends, and double taps it to put it in the list below, where it keeps the palette colour it
 * was given. A line that sits off the beat is nudged on its own; tapping again later in the song realigns the grid from there. Nothing is cut until Chop
 * is pressed, because the cuts are rendered into files and cannot be corrected afterwards. The cuts are found on the song, and made on its vocal stem.
 *
 * Every line of text sits in a slot of fixed size, and the panel has a fixed height, so nothing moves or resizes while a finger is on the waveform.
 */
export function SongChopModal({
  pad,
  vocalsName,
  palette,
  beatsPerBar: projectBeatsPerBar,
  freeSlots,
  onConfirm,
  onClose,
}: {
  /** The song: the cuts are found on it. */
  pad: Pad;
  /** The vocal stem the sections are cut from, for the summary. */
  vocalsName: string;
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
  const timeline = useRef<GridTimelineHandle>(null);
  const colorOf = (i: number) => palette.colors[i % palette.colors.length];

  const [phase, setPhase] = useState<"tap" | "edit">("tap");
  const [beatsPerBar, setBeatsPerBar] = useState(projectBeatsPerBar);
  /** The times (seconds in the song) of the taps made, in the order they were made. */
  const [taps, setTaps] = useState<number[]>([]);
  const sorted = useMemo(() => [...taps].sort((a, b) => a - b), [taps]);
  const estimate = useMemo(() => estimateTempo(sorted), [sorted]);

  // The grid once it is locked in; the beats per bar can still be changed afterwards.
  const [locked, setLocked] = useState<TapGrid | null>(null);
  const [mode, setMode] = useState<"select" | "adjust">("select");
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  /** The section being picked, and the ones put in the list (with how many colours have been given out, so a colour is not reused until the palette runs round). */
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sections, setSections] = useState<PickedSection[]>([]);
  const [colorsGiven, setColorsGiven] = useState(0);
  const [wholeGrid, setWholeGrid] = useState(false);
  /** Tapping again later in the song, to realign the grid from there. */
  const [tapOn, setTapOn] = useState(false);

  const [keyPc, setKeyPc] = useState(0);
  const [minor, setMinor] = useState(false);
  const [useKey, setUseKey] = useState(true);
  const [keyReady, setKeyReady] = useState(false);

  // The song's key is found in the background, as a suggestion; the tempo comes from the taps.
  useEffect(() => {
    let alive = true;
    const copy = mixToMono(pad.channelData);
    nextAnalysisWorker()
      .analyzeSong(Comlink.transfer(copy, [copy.buffer]), sampleRate, projectBeatsPerBar)
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
  const edit = grid !== null && phase === "edit";

  // Where the audio stops confirming the grid: a "tap from here" marker points at each. Worked out a moment after the grid last changed.
  const envelope = useMemo(() => attackEnvelope(mono), [mono]);
  const [driftLines, setDriftLines] = useState<number[]>([]);
  useEffect(() => {
    if (!grid || phase !== "edit") return setDriftLines([]);
    const timer = window.setTimeout(() => setDriftLines(findDriftMarkers(envelope, grid, totalFrames)), 250);
    return () => window.clearTimeout(timer);
  }, [grid, phase, envelope, totalFrames]);

  const gridRef = useRef(grid);
  gridRef.current = grid;
  const clickLines = useCallback((from: number, to: number) => {
    const g = gridRef.current;
    if (!g) return [];
    return linesBetween(g, from, to).map((n) => ({ frame: lineFrame(g, n), bar: isBarLine(g, n) }));
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
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /**
   * A knock on the microphone. While the song plays it is a tap. While the microphone is armed and the song is stopped, the first one above the
   * threshold starts the song (from the middle of the view, as Play does) and is the first tap; the taps after it carry on until Stop is pressed.
   */
  const micTap = (secondsAgo: number) => {
    if (player.playing) return registerTap(secondsAgo);
    startWithTap();
  };
  /** The first hit starts the song and is the first tap: the tap button is the play button until the song is playing. */
  const startWithTap = () => {
    const from = Math.max(0, timeline.current?.centre() ?? 0);
    player.start(from);
    const frame = player.frameNow() ?? from;
    // Starting from before the taps made means starting over: they belong to another run of the song.
    setTaps((prev) => [...(prev.length > 0 && frame / sampleRate < Math.max(...prev) ? [] : prev), frame / sampleRate]);
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 90);
  };
  const micTapRef = useRef(micTap);
  micTapRef.current = micTap;

  const onTapDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // The first press starts the song (and is the first tap); the ones after it are taps. A press waited in the browser's queue for a moment: the song has moved on by then.
    if (!player.playing) return startWithTap();
    registerTap(Math.min(0.2, Math.max(0, (performance.now() - e.timeStamp) / 1000)));
  };

  // The microphone: a knock on the back of the phone, picked up as a tap.
  const mic = useRef<MicTaps | null>(null);
  const micLevel = useRef(0);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState("");
  const [sensitivity, setSensitivity] = useState(0.6);
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
    // Wake the audio context inside this press, before the microphone's permission question: a browser only lets a press do it.
    void getAudioContext().resume();
    try {
      mic.current = await startMicTaps(
        getAudioContext(),
        sensitivityRef.current,
        (secondsAgo) => micTapRef.current(secondsAgo),
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
    if (player.playing) {
      player.stop();
      // Stop ends an armed run: the microphone is let go.
      if (mic.current) stopMic();
      return;
    }
    const from = Math.max(0, timeline.current?.centre() ?? 0);
    // Playing from before the taps made means starting over: they belong to another run of the song.
    if ((phase === "tap" || tapOn) && sorted.length > 0 && from / sampleRate < sorted[sorted.length - 1]) setTaps([]);
    player.start(from);
  };

  /** The sharpest attack in the audio within `radius` frames of a frame, or the frame itself where there is none. */
  const attackNear = useCallback(
    (frame: number, radius: number) => {
      const from = Math.max(0, Math.round(frame) - radius - 16);
      const to = Math.min(totalFrames, Math.round(frame) + radius + 16);
      if (to - from < 40) return Math.round(frame);
      return from + snapToAttack(mono.subarray(from, to), Math.round(frame) - from, radius);
    },
    [mono, totalFrames],
  );

  const lockGrid = () => {
    if (!estimate) return;
    player.stop();
    stopMic();
    // The taps are a finger's, a few tens of milliseconds out: the audio's own attacks make the grid exact.
    const refined = refineWithTransients(estimate, sampleRate, attackNear);
    timeline.current?.centreOn(estimate.accepted[0] * sampleRate);
    setLocked(gridFromTaps(refined, sampleRate, beatsPerBar));
    setTaps([]);
    setSections([]);
    setSelection(null);
    setSelectedLine(null);
    setColorsGiven(0);
    setMode("select");
    setPhase("edit");
  };

  const tapAgain = () => {
    if (sections.length > 0 && !window.confirm("Tapping the whole grid again makes a new one and empties the list of sections. Go back to tapping?")) return;
    player.stop();
    setTapOn(false);
    setTaps([]);
    setPhase("tap");
  };

  /** Tapped later in the song: the grid follows the taps (and the audio's attacks) from there on. */
  const realign = () => {
    if (!estimate || !grid) return;
    player.stop();
    const refined = refineWithTransients(estimate, sampleRate, attackNear);
    setLocked(realignGrid(grid, { origin: refined.origin * sampleRate, beatFrames: refined.period * sampleRate }));
    setTaps([]);
    setTapOn(false);
    stopMic();
  };

  // ---- editing the grid ----

  const setGridEdit = (next: TapGrid) => setLocked(next);

  /** A "tap from here" marker was tapped: tap tempo opens with the view on that line, to play from there and tap along. */
  const tapFromHere = (line: number) => {
    if (!grid) return;
    player.stop();
    setTaps([]);
    setTapOn(true);
    setSelectedLine(line);
    timeline.current?.centreOn(lineFrame(grid, line));
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
    setGridEdit(placeLine(grid, selectedLine, attackNear(at, Math.round(0.03 * sampleRate))));
  };

  /** Sets the chosen line as 1.1.1. Changing it later asks first: every bar after it is counted from there. */
  const setBarOne = () => {
    if (!grid || selectedLine === null) return;
    if (grid.downbeats.length > 0 && !window.confirm("Change the downbeat? The bars after this line will be counted from it, and the accents after it move.")) return;
    setGridEdit(setDownbeat(grid, selectedLine));
  };

  // ---- the sections ----

  const onHandleRelease = (which: "start" | "end") => {
    if (!grid || !selection) return;
    // The start plays from the line. The end plays from a bar before it, and carries on past it, to hear the section run into what follows.
    const line = which === "start" ? selection.first : selection.last - grid.beatsPerBar;
    player.start(Math.max(0, lineFrame(grid, line)));
  };

  const addSelection = () => {
    if (!selection) return;
    setSections((prev) => inOrder([...prev.filter((x) => x.first !== selection.first), { ...selection, colorIndex: colorsGiven }]));
    setColorsGiven((c) => c + 1);
    setSelection(null);
  };
  const removeSection = (first: number) => setSections((prev) => prev.filter((s) => s.first !== first));

  const nudged = grid && selectedLine !== null ? (grid.offsets[selectedLine] ?? 0) : 0;
  const plans = useMemo(() => (grid && edit ? planSections(totalFrames, grid, sections) : []), [grid, edit, totalFrames, sections]);
  const fits = Math.min(plans.length, freeSlots);
  const odd = grid && edit ? oddSections(grid, sections) : [];
  const ordered = inOrder(sections);
  const tempo = grid && ordered.length > 0 ? bpmAt(grid, ordered[0].first) : grid ? bpmAt(grid, 0) : 0;
  const binSections = ordered.map((s) => ({ first: s.first, last: s.last, color: colorOf(s.colorIndex) }));
  const selectionLimit = grid ? maxBeats(grid) : 0;

  const need = Math.max(0, MIN_TAPS - (estimate?.accepted.length ?? 0));
  const tapNote =
    taps.length === 0
      ? phase === "tap"
        ? "Hit the big button on the beat you want to start from: the song starts with that first tap. Keep tapping until the tempo locks in."
        : "Hit the big button where the grid has drifted: the song starts there with your first tap. Then realign the grid."
      : !estimate
        ? "Keep tapping: it needs two taps to find a tempo."
        : estimate.locked
          ? phase === "tap"
            ? "Locked in. A few more taps make it steadier, or lock the grid."
            : "Locked in. Realign the grid from here."
          : need > 0
            ? `${need} more tap${need === 1 ? "" : "s"} first. A stray tap is ignored if the rhythm carries on.`
            : "Nearly there: keep tapping along until it says locked in, or go ahead now.";
  const note = phase === "tap" || tapOn ? tapNote : MODE_NOTES[mode];

  const readoutOne =
    phase === "tap" || tapOn
      ? estimate
        ? `${estimate.bpm.toFixed(1)} BPM from ${estimate.accepted.length} tap${estimate.accepted.length === 1 ? "" : "s"}`
        : `${taps.length} tap${taps.length === 1 ? "" : "s"}`
      : selectedLine !== null && grid
        ? `Line ${selectedLine} at ${formatTime(lineFrame(grid, selectedLine) / sampleRate)}`
        : selection && grid
          ? `Picked: ${barsText(selection.last - selection.first, grid.beatsPerBar)}`
          : `${tempo.toFixed(2)} BPM`;
  const readoutTwo =
    phase === "tap" || tapOn
      ? estimate
        ? `${estimate.ignored.length} ignored${estimate.locked ? ", locked in" : ""}`
        : ""
      : selectedLine !== null && grid
        ? `${grid.downbeats.includes(selectedLine) ? "1.1.1. " : isBarLine(grid, selectedLine) ? "Downbeat. " : ""}${nudged === 0 ? "On the grid" : `Moved ${nudged >= 0 ? "+" : ""}${((nudged / sampleRate) * 1000).toFixed(1)} ms`}`
        : selection && grid
          ? `${((lineFrame(grid, selection.last) - lineFrame(grid, selection.first)) / sampleRate).toFixed(2)} s`
          : grid && grid.downbeats.length === 0
            ? "No 1.1.1 set yet"
            : "";

  const marks = useMemo(() => {
    if (phase !== "tap" && !tapOn) return undefined;
    const ignored = new Set(estimate?.ignored ?? []);
    return taps.map((t) => ({ frame: t * sampleRate, ignored: ignored.has(t) }));
  }, [phase, tapOn, taps, estimate, sampleRate]);
  const startFrame = sorted.length > 0 ? sorted[0] * sampleRate : (locked?.segments[0].frame ?? 0);

  /** The tap button, the microphone and its meter: the same for the first tapping and for tapping again later. */
  const tapControls = (
    <>
      <button className={`chop__tap${flash ? " chop__tap--hit" : ""}`} onPointerDown={onTapDown} aria-label="Tap on the beat: the first tap starts the song">
        {player.playing ? "Tap" : "Play + tap"}
      </button>
      <div className="chop__row">
        <button className="chop__btn chop__toggle" aria-pressed={micOn} onClick={toggleMic} title="Arm the microphone, then knock on the back of the phone: the first knock starts the song and is the first tap, the rest are taps until Stop">
          {micOn ? "Armed" : "Arm mic"}
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
        <span className="chop__hint">{micError || (micOn ? (player.playing ? "Listening for knocks. Stop ends it." : "Armed: the first knock starts the song and is the first tap.") : "Arm it, then knock close to the microphone. Headphones keep the song out of it.")}</span>
      </div>
    </>
  );

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="chop" role="dialog" aria-label="Chop song to patterns" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>{phase === "tap" ? "Tap the tempo" : "Pick the sections"}</span>
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
            sections={edit ? binSections : []}
            selection={edit ? selection : null}
            selectionColor={colorOf(colorsGiven)}
            maxBeats={selectionLimit}
            selectedLine={edit ? selectedLine : null}
            mode={edit && !tapOn ? mode : "view"}
            taps={marks}
            startFrame={startFrame}
            onLine={setSelectedLine}
            onSelect={setSelection}
            onHandleRelease={onHandleRelease}
            onDoubleTap={addSelection}
            driftLines={edit ? driftLines : []}
            onDriftTap={tapFromHere}
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
          <div className="chop__row">
            <label className="chop__grow">
              Click volume
              <input type="range" min={0} max={1} step={0.01} value={player.clickVolume} onChange={(e) => player.setClickVolume(Number(e.target.value))} aria-label="Click volume" />
            </label>
          </div>

          {phase === "tap" ? (
            <>
              {tapControls}
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
                <button className="chop__btn chop__toggle" aria-pressed={!tapOn && mode === "select"} onClick={() => (setTapOn(false), setMode("select"))}>
                  Select
                </button>
                <button className="chop__btn chop__toggle" aria-pressed={!tapOn && mode === "adjust"} onClick={() => (setTapOn(false), setMode("adjust"))}>
                  Adjust grid
                </button>
                <button className="chop__btn chop__toggle" aria-pressed={tapOn} onClick={() => setTapOn((on) => !on)} title="Tap along again later in the song to realign the grid from there">
                  Tap tempo
                </button>
              </div>

              {tapOn ? (
                <>
                  {tapControls}
                  <div className="chop__row">
                    <button className="chop__btn" disabled={taps.length === 0} onClick={() => setTaps([])}>
                      Clear taps
                    </button>
                    <button className="chop__btn chop__grow" disabled={!estimate || estimate.accepted.length < MIN_TAPS} onClick={realign} title="Moves the lines from the first tap on onto the taps and the attacks near them">
                      Realign the grid from here
                    </button>
                  </div>
                </>
              ) : mode === "adjust" ? (
                <>
                  <div className="chop__row">
                    {[
                      ["-10 ms", () => nudgeMs(-10)],
                      ["-1", () => nudge(-1)],
                      ["+1", () => nudge(1)],
                      ["+10 ms", () => nudgeMs(10)],
                    ].map(([label, action]) => (
                      <button key={label as string} className="chop__btn" disabled={!wholeGrid && selectedLine === null} onClick={action as () => void}>
                        {label as string}
                      </button>
                    ))}
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
              ) : (
                <div className="chop__row">
                  <button className="chop__btn chop__grow" disabled={!selection} onClick={addSelection}>
                    Add the selection to the list
                  </button>
                </div>
              )}

              {!tapOn ? (
                <div className="chop__row">
                  <button className="chop__btn chop__grow" disabled={selectedLine === null} onClick={setBarOne} title="Counts the bars from the chosen line: the first beat of a bar is accented from here on">
                    Set 1.1.1 here
                  </button>
                  <button className="chop__btn" disabled={!grid || grid.downbeats.length === 0} onClick={() => grid && setGridEdit({ ...grid, downbeats: [] })}>
                    Clear 1.1.1s
                  </button>
                </div>
              ) : null}

              <div className="chop__bin" aria-label="Sections">
                {ordered.length === 0 ? (
                  <p className="chop__bin-empty">No sections yet. Pick one on the waveform and double tap it.</p>
                ) : (
                  ordered.map((s, i) => (
                    <div key={s.first} className="chop__bin-row">
                      <button className="chop__bin-main" onClick={() => grid && timeline.current?.centreOn(lineFrame(grid, s.first))}>
                        <span className="chop__bin-swatch" style={{ background: colorOf(s.colorIndex) }} />
                        <span>Section {i + 1}</span>
                        <span className="chop__bin-bars">{grid ? barsText(s.last - s.first, grid.beatsPerBar) : ""}</span>
                      </button>
                      <button className="chop__btn" onClick={() => removeSection(s.first)} aria-label={`Remove section ${i + 1}`}>
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="chop__row">
                <label>
                  Beats per bar
                  <input type="number" min={1} max={16} step={1} value={beatsPerBar} onChange={(e) => setBeatsPerBar(Math.min(16, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
                </label>
                <button className="chop__btn" onClick={tapAgain}>
                  Tap it all again
                </button>
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
                {ordered.length === 0
                  ? `Nothing is cut until you pick sections. A section is never longer than ${MAX_SECTION_BARS} bars.`
                  : `The cuts are made on the song and applied to "${vocalsName}". ${plans.length} section${plans.length === 1 ? "" : "s"}.`}
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
            onClick={() => grid && onConfirm({ bpm: tempo, beatsPerBar, plans, keyPc: useKey ? keyPc : null })}
          >
            Chop into {fits} pattern{fits === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
