import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scrubSpeed } from "./scrub";
import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../workers/workerClient";
import { chopColor, type Palette } from "../audio/palettes";
import { mixToMono } from "../audio/song/beats";
import type { SectionPlan } from "../audio/song/chop";
import {
  barLineNear,
  anchorAtPlayhead,
  nudgeGridMarks,
  barsIn,
  baseGrid,
  chopLines,
  fineChopLines,
  commit,
  gridWithMarks,
  NO_MARKS,
  redo,
  sectionsBetween,
  startHistory,
  tooLong,
  undo,
  type Marks,
} from "../audio/song/chopMarks";
import { detectSongTempo } from "../audio/song/detectors";
import { bpmAt, fineLineNear, isBarLine, lineFrame, linesBetween, MAX_SECTION_BARS, planSections, type TapGrid } from "../audio/song/tapGrid";
import { buildPyramid } from "../audio/song/waveform";
import { ChopTimeline, type ChopTimelineHandle } from "./ChopTimeline";
import { Knob } from "./Knob";
import { useSongPlayer } from "./useSongPlayer";
import type { SongKey } from "../audio/song/keyOffset";
import { padTitle } from "../audio/song/stems";
import { loadChopMarks, saveChopMarks } from "../storage";
import type { Pad } from "./PadPanel";

import { SectionWorkspace } from "./SectionWorkspace";
import type { WorkspaceResult } from "../audio/song/sectionWorkspace";

export interface ChopSettings {
  maker?: WorkspaceResult;
  grid?: TapGrid;
  /** The tempo of the grid where the first section starts: the project tempo the export writes. */
  bpm: number;
  beatsPerBar: number;
  /** The sections, on the song's own frames. */
  plans: SectionPlan[];
  /** The song's key as detected (null when no beat, so no key, was found): what the key picked on the piano is compared with. */
  key: SongKey | null;
}

/** What the automatic detection found: the tempo and where bar 1 starts. */
interface Detected {
  bpm: number;
  downbeatSeconds: number;
}

/** The BPM readout: a finger that moves this far (CSS pixels) is scrubbing; two taps within this (ms) are a double tap. */
const BPM_DRAG_PX = 8;
const BPM_DOUBLE_MS = 320;
/** Scrubbing: BPM per pixel dragged to the right at full speed; the lower the finger is on the screen the slower, to a tenth at the bottom (`scrubSpeed`). */
const BPM_PER_PX = 0.03;
const BPM_MIN = 30;
const BPM_MAX = 300;
/** The + and - keys: a tap nudges by this much; held, after a pause, the rate climbs from BPM_HOLD_START (BPM per second) to a semitone of tempo per second. */
const BPM_NUDGE = 0.01;
const BPM_HOLD_DELAY_MS = 350;
const BPM_HOLD_START = 0.05;
const BPM_HOLD_DOUBLE_S = 0.6;
const SEMITONE_RATIO = 2 ** (1 / 12) - 1;

/** Bar-jump presses this close together keep stepping from the line the last one went to. */
const JUMP_REPEAT_MS = 2500;
/** A length in bars for the list: whole bars as a whole number, otherwise to two places. */
const barsText = (bars: number) => {
  const shown = +bars.toFixed(2);
  return `${shown} bar${shown === 1 ? "" : "s"}`;
};

/** A pixel-drawn plus or minus (a 5 x 5 grid of squares). */
function NudgeIcon({ plus }: { plus: boolean }) {
  return (
    <svg viewBox="0 0 5 5" width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="2" width="5" height="1" fill="currentColor" />
      {plus && <rect x="2" y="0" width="1" height="5" fill="currentColor" />}
    </svg>
  );
}

/** A pixel-drawn A (a 5 x 5 grid of squares). */
function AutoIcon() {
  const squares = [1, 2, 3, 5, 9, 10, 11, 12, 13, 14, 15, 19, 20, 24];
  return (
    <svg viewBox="0 0 5 5" width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
      {squares.map((n) => (
        <rect key={n} x={n % 5} y={Math.floor(n / 5)} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

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
  unit = "pattern",
  onConfirm,
  pitchForKey,
  onClose,
}: {
  /** The song: the cuts are found on it. */
  pad: Pad;
  /** The selected colour palette: sections take its colours in turn. */
  palette: Palette;
  /** The project's time signature numerator. */
  beatsPerBar: number;
  freeSlots: number;
  /** What the chop makes: a pattern per section (acapella mode) or a chop on the chopper (chopper mode). */
  unit?: "pattern" | "chop";
  pitchForKey?: (key: SongKey | null) => number;
  onConfirm: (settings: ChopSettings, openMaker?: boolean) => void | Promise<void>;
  onClose: () => void;
}) {
  const sampleRate = pad.sampleRate;
  const totalFrames = pad.channelData[0].length;
  const pyramid = useMemo(() => buildPyramid(pad.channelData), [pad.channelData]);
  const mono = useMemo(() => mixToMono(pad.channelData), [pad.channelData]);
  const timeline = useRef<ChopTimelineHandle>(null);
  /** Chopper mode: the grid and the chops go down to sixteenth notes (the pattern maker's finest step too). */
  const fine = unit === "chop";
  const [workspaceGrid, setWorkspaceGrid] = useState<TapGrid | null>(null);
  const colorOf = (i: number) => chopColor(palette.colors, i);

  const [detected, setDetected] = useState<Detected | "none" | null>(null);
  // The markers are kept under the song's name and length, so they come back after the editor is closed or the app is reopened.
  const songKey = `${padTitle(pad)}|${totalFrames}|${sampleRate}`;
  const [history, setHistory] = useState(() => {
    const saved = loadChopMarks(songKey);
    return startHistory<Marks>(saved ?? NO_MARKS);
  });
  const marks = history.present;
  /** What the last press did, for the readout. */
  const [, setStatus] = useState(() => (history.present === NO_MARKS ? "" : "Your saved markers are back"));
  useEffect(() => {
    saveChopMarks(songKey, marks);
  }, [songKey, marks]);
  /** X (or a tap outside) asks first, so a stray tap cannot throw the editor away. The markers stay saved either way. */
  const askClose = () => {
    if (window.confirm("Close the chopper? Your chop markers are saved and will be here when you open it again.")) onClose();
  };
  /** Whether scrubbing pulls the line onto grid lines and markers; off, to place a marker exactly where the sound is. */
  const [magnetOn, setMagnetOn] = useState(true);


  const [detecting, setDetecting] = useState(true);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const detectionAnchor = marks.oneOne ?? marks.downbeats.at(-1) ?? null;
  const [detectedKey, setDetectedKey] = useState<SongKey | null>(null);
  useEffect(() => {
    let alive = true;
    setDetecting(true);
    setDetectionFailed(false);
    detectSongTempo(mono, sampleRate, detectionAnchor)
      .then(result => { if (alive) setDetected(result); })
      .catch(() => {
        if (!alive) return;
        setDetectionFailed(true);
        setDetected(previous => previous ?? "none");
      })
      .finally(() => { if (alive) setDetecting(false); });
    return () => { alive = false; };
  }, [mono, sampleRate, detectionAnchor, analysisRevision]);

  useEffect(() => {
    let alive = true;
    const copy = mono.slice();
    nextAnalysisWorker().analyzeSongKey(Comlink.transfer(copy, [copy.buffer]), sampleRate)
      .then(key => { if (alive) setDetectedKey({ pc: key.pc, minor: key.minor }); })
      .catch(() => { if (alive) setDetectedKey(null); });
    return () => { alive = false; };
  }, [mono, sampleRate]);

  /** The detected grid, or a plain 120 BPM one when no beat could be found (the downbeat markers then do the work). */
  const base = useMemo<TapGrid | null>(() => {
    if (detected === null) return null;
    return detected === "none" ? baseGrid(sampleRate, beatsPerBar, 120, 0) : baseGrid(sampleRate, beatsPerBar, detected.bpm, detected.downbeatSeconds);
  }, [detected, sampleRate, beatsPerBar]);
  /** The tempo being scrubbed with a finger on the BPM readout, not yet in the history (it is when the finger lifts). */
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const shownMarks = useMemo<Marks>(() => (liveBpm === null ? marks : { ...marks, bpm: liveBpm }), [marks, liveBpm]);
  const rawGrid = useMemo(() => (base ? gridWithMarks(base, shownMarks) : null), [base, shownMarks]);
  const grid = rawGrid;

  const lines = useMemo(() => {
    if (!grid) return [];
    return fine ? fineChopLines(grid, marks.chops) : chopLines(grid, marks.chops);
  }, [grid, marks.chops, fine]);
  const sections = useMemo(() => sectionsBetween(lines), [lines]);
  const plans = useMemo(() => (grid ? planSections(totalFrames, grid, sections) : []), [grid, totalFrames, sections]);
  const fits = Math.min(plans.length, freeSlots);
  // Chopper mode has no limit on a section's length (acapella and synced mode keep the 16 bar maximum).
  const longOnes = grid && !fine ? sections.map((s, i) => (tooLong(grid, s) ? i + 1 : 0)).filter(Boolean) : [];
  const tempo = grid ? bpmAt(grid, sections.length > 0 ? sections[0].first : 0) : 0;

  const gridRef = useRef(grid);
  gridRef.current = grid;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const marksRef = useRef(marks);
  marksRef.current = marks;
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
        autoChopRef.current(frame);
        if (frame >= totalFrames) return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, frameNow, totalFrames]);

  const autoChopRef = useRef<(frame: number) => void>(() => {});
  /** The bar line the last pause snapped to: Play starts from it even if pressed while the line is still gliding there. */
  const pausedAt = useRef<number | null>(null);
  /** Pausing leaves the line where the song was and glides it onto the nearest bar line; Play then starts from that line. */
  const togglePlay = () => {
    if (player.playing) {
      player.stop();
      pausedAt.current = timeline.current?.snap() ?? null;
      return;
    }
    const from = pausedAt.current ?? timeline.current?.cursor() ?? 0;
    pausedAt.current = null;
    timeline.current?.setCursor(from);
    player.start(from);
  };

  /** Whether the song was playing when a finger started scrubbing: letting go then carries on playing from the line, with no snap. */
  const scrubbedPlaying = useRef(false);
  const scrubStart = () => {
    pausedAt.current = null;
    scrubbedPlaying.current = player.playing;
    player.stop();
  };
  const scrubEnd = (): boolean => {
    if (!scrubbedPlaying.current) return false;
    scrubbedPlaying.current = false;
    player.start(timeline.current?.cursor() ?? 0);
    return true;
  };

  /** The last jump's target line, direction and time: presses within JUMP_REPEAT_MS of each other keep stepping from it. */
  const lastJump = useRef<{ line: number; direction: number; at: number } | null>(null);
  /** Jumps the line `bars` bars back or forward (`direction` -1 or 1) along the bar lines, and carries on playing from there if the song was playing. */
  const jump = (direction: number, bars: number) => {
    if (!grid) return;
    pausedAt.current = null;
    const cursor = timeline.current?.cursor() ?? 0;
    const now = performance.now();
    const last = lastJump.current;
    lastJump.current = null;
    let line: number;
    if (last && last.direction === direction && now - last.at < JUMP_REPEAT_MS) {
      // A repeat press soon after a jump counts from the line that jump went to, not from where the playing song has drifted since.
      line = last.line + direction * grid.beatsPerBar * bars;
    } else {
      const near = barLineNear(grid, cursor);
      const nearFrame = lineFrame(grid, near);
      // From a bar line, the whole distance; from between two, the bar line already ahead in that direction counts as the first.
      const onLine = Math.abs(nearFrame - cursor) < grid.segments[0].beatFrames / 8;
      const ahead = !onLine && (direction > 0 ? nearFrame > cursor : nearFrame < cursor);
      line = near + direction * grid.beatsPerBar * (ahead ? bars - 1 : bars);
    }
    const frame = Math.min(totalFrames, Math.max(0, lineFrame(grid, line)));
    lastJump.current = { line, direction, at: now };
    timeline.current?.setCursor(frame);
    if (player.playing) {
      player.start(frame);
    }
  };

  // ---- markers ----

  const change = (next: Marks, message: string) => {
    setHistory((h) => commit(h, next));
    setStatus(message);
  };

  const addChop = () => {
    if (!grid) return;
    const cursor = timeline.current?.cursor() ?? 0;
    const lineOf = (frame: number) => (fine ? fineLineNear(grid, frame) : barLineNear(grid, frame));
    const line = lineOf(cursor);
    const at = lineFrame(grid, line);
    const there = marks.chops.find((f) => lineOf(f) === line);
    if (there !== undefined) return change({ ...marks, chops: marks.chops.filter((f) => f !== there) }, `Chop removed at ${formatTime(at / sampleRate)}`);
    // Outside chopper mode a section may not pass 16 bars: markers fill in every 16 bars from the nearest chop before this one when it is further back than that.
    const before = lines.filter((n) => n < line).pop();
    const filler: number[] = [];
    if (before !== undefined && !fine) for (let n = before + MAX_SECTION_BARS * grid.beatsPerBar; n < line; n += MAX_SECTION_BARS * grid.beatsPerBar) filler.push(lineFrame(grid, n));
    change({ ...marks, chops: [...marks.chops, ...filler, cursor] }, `Chop added at ${formatTime(at / sampleRate)}${filler.length ? ` (+${filler.length} at 16 bars)` : ""}`);
  };

  /** While the song plays, a chop marker is added by itself where the section since the last chop reaches 16 bars. */
  const autoChop = (frame: number) => {
    const g = gridRef.current;
    const ls = linesRef.current;
    if (!g || ls.length === 0 || fine) return;
    const step = MAX_SECTION_BARS * g.beatsPerBar;
    const next = ls[ls.length - 1] + step;
    if (frame < lineFrame(g, next) || lineFrame(g, next) >= totalFrames) return;
    const m = marksRef.current;
    change({ ...m, chops: [...m.chops, lineFrame(g, next)] }, `Chop added at ${formatTime(lineFrame(g, next) / sampleRate)} (16 bars)`);
  };

  /** Puts a chop marker every `bars` bars from the first chop (or the first bar line) to the end of the song, then chops straight away. */
  const chopEvery = (bars: number) => {
    if (!grid) return;
    const step = bars * grid.beatsPerBar;
    let start = lines.length > 0 ? lines[0] : barLineNear(grid, 0);
    while (lineFrame(grid, start) < 0) start += grid.beatsPerBar;
    const cuts: number[] = [];
    for (let n = start; lineFrame(grid, n) < totalFrames; n += step) cuts.push(n);
    // The last bar line inside the song closes the final section when it is at least a bar on from the last cut.
    let end = barLineNear(grid, totalFrames);
    while (lineFrame(grid, end) > totalFrames) end -= grid.beatsPerBar;
    if (end - cuts[cuts.length - 1] >= grid.beatsPerBar) cuts.push(end);
    const picked = sectionsBetween(cuts);
    const chosen = planSections(totalFrames, grid, picked);
    if (chosen.length === 0) return setStatus("No whole bars to chop");
    change({ ...marks, chops: cuts.map((n) => lineFrame(grid, n)) }, `Chopped by ${bars}`);
    onConfirm({ bpm: bpmAt(grid, picked[0].first), grid, beatsPerBar, plans: chosen, key: detectedKey });
  };

  autoChopRef.current = autoChop;

  const scaleTempo = (factor: number) => change({ ...marks, tempoScale: marks.tempoScale * factor, bpm: marks.bpm == null ? null : marks.bpm * factor }, factor > 1 ? "Tempo doubled" : "Tempo halved");

  // ---- the BPM readout: double tap goes back to the automatic tempo; a drag left or right scrubs it, slower the lower the finger is ----
  const bpmTouch = useRef<{ x0: number; y0: number; x: number; bpm: number; moved: boolean } | null>(null);
  const lastBpmTap = useRef(0);
  const bpmNow = grid ? bpmAt(grid, 0) : 0;
  const bpmDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!grid) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    bpmTouch.current = { x0: e.clientX, y0: e.clientY, x: e.clientX, bpm: bpmNow, moved: false };
  };
  const bpmMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const t = bpmTouch.current;
    if (!t) return;
    if (!t.moved && Math.abs(e.clientX - t.x0) < BPM_DRAG_PX) return;
    t.moved = true;
    // Each step counts at the speed of where the finger is now: slower the lower it is on the screen.
    t.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, t.bpm + (e.clientX - t.x) * BPM_PER_PX * scrubSpeed(t.y0, e.clientY)));
    t.x = e.clientX;
    setLiveBpm(t.bpm);
  };
  const bpmUp = () => {
    const t = bpmTouch.current;
    bpmTouch.current = null;
    if (!t || !grid) return;
    if (t.moved) {
      const bpm = Math.round(t.bpm * 100) / 100;
      setLiveBpm(null);
      return change({ ...marks, bpm }, `Tempo set to ${bpm.toFixed(2)} BPM`);
    }
    const now = performance.now();
    if (now - lastBpmTap.current < BPM_DOUBLE_MS) {
      lastBpmTap.current = 0;
      const bpm = Math.round(bpmNow);
      if (bpm >= BPM_MIN) change({ ...marks, bpm }, `Tempo snapped to ${bpm} BPM`);
    } else lastBpmTap.current = now;
  };

  // ---- the + and - keys: tap = 0.01, hold = slowly accelerating up to a semitone of tempo per second ----
  const nudgeHold = useRef<{ bpm: number; timer: number; raf: number } | null>(null);
  const nudgeStop = () => {
    const h = nudgeHold.current;
    if (!h) return;
    nudgeHold.current = null;
    window.clearTimeout(h.timer);
    cancelAnimationFrame(h.raf);
    const bpm = Math.round(h.bpm * 100) / 100;
    setLiveBpm(null);
    // (always committed: while held the grid shown already runs at the live tempo, so comparing with it would drop the change and snap back)
    if (grid) change({ ...marks, bpm }, `Tempo set to ${bpm.toFixed(2)} BPM`);
  };
  const nudgeStart = (dir: 1 | -1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!grid || nudgeHold.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const clamp = (v: number) => Math.min(BPM_MAX, Math.max(BPM_MIN, v));
    const h = { bpm: clamp(Math.round(bpmNow * 100) / 100 + dir * BPM_NUDGE), timer: 0, raf: 0 };
    nudgeHold.current = h;
    setLiveBpm(h.bpm);
    h.timer = window.setTimeout(() => {
      const t0 = performance.now();
      let last = t0;
      const tick = (now: number) => {
        const held = (now - t0) / 1000;
        const rate = Math.min(BPM_HOLD_START * 2 ** (held / BPM_HOLD_DOUBLE_S), h.bpm * SEMITONE_RATIO);
        h.bpm = clamp(h.bpm + dir * rate * ((now - last) / 1000));
        last = now;
        setLiveBpm(h.bpm);
        h.raf = requestAnimationFrame(tick);
      };
      h.raf = requestAnimationFrame(tick);
    }, BPM_HOLD_DELAY_MS);
  };

  /** The A key: the tempo goes back to the Music Tempo result. It is lit while that is in charge and an anchor is set. */
  const autoTempo = () => {
    if (marks.bpm != null) change({ ...marks, bpm: null }, "Tempo back to automatic");
  };

  const placeAnchor = () => {
    if (!grid) return;
    const cursor = Math.max(0, Math.min(totalFrames, timeline.current?.cursor() ?? 0));
    const frame = anchorAtPlayhead(grid, cursor, magnetOn, totalFrames - 1);
    if (frame < 0 || frame >= totalFrames) return;
    // Stop a pending glide without moving the playhead or source audio.
    timeline.current?.setCursor(cursor);
    setLiveBpm(null);
    // Keep the current audible tempo while analysis runs, and as the fallback if it fails.
    setDetected({ bpm: bpmAt(grid, 0), downbeatSeconds: frame / sampleRate });
    change({ ...marks, oneOne: frame, downbeats: [], gridOffsetFrames: 0, bpm: null, tempoScale: 1 }, `Anchor placed at ${formatTime(frame / sampleRate)}; detecting BPM`);
    setAnalysisRevision(revision => revision + 1);
  };

  const nudgeGrid = (direction: -1 | 1) => {
    change(nudgeGridMarks(marks, sampleRate, direction), `Grid nudged ${direction < 0 ? "earlier" : "later"} by 1 ms`);
  };

  const stepHistory = (step: typeof undo, message: string) => {
    setHistory(step);
    setStatus(message);
  };

  // ---- what is on show ----

  const drawnSections = grid ? sections.map((s, i) => ({ start: lineFrame(grid, s.first), end: lineFrame(grid, s.last), color: colorOf(i) })) : [];
  const chopFrames = grid ? lines.map((n) => lineFrame(grid, n)) : [];
  
  const note = detecting ? "Music Tempo is detecting BPM from the anchor…" : detectionFailed ? "Detection failed. Previous BPM kept; adjust BPM and listen to the click." : "Anchor locks a downbeat. Adjust BPM around it; nudge grid −/+ moves timing by 1 ms.";
  const bpmText = detected === null ? "..." : detected === "none" && marks.bpm == null && marks.downbeats.length === 0 && marks.oneOne === null ? "--" : (grid ? bpmAt(grid, 0) : 0).toFixed(2);

  if (workspaceGrid) {
    return <SectionWorkspace channelData={pad.channelData} sampleRate={sampleRate} beatFrames={60 * sampleRate / bpmAt(workspaceGrid, 0)} beatsPerBar={beatsPerBar} grid={workspaceGrid} pitch={pitchForKey?.(detectedKey) ?? 0} colors={palette.colors} chops={plans.map((p, i) => ({ slice: i, start: p.start, length: p.length, bars: p.bars, steps: Math.max(1, Math.round(p.length / (60 * sampleRate / tempo) * 4)), barIndex: p.barIndex ?? 0, colorIndex: (p.barIndex ?? 0) % 4, color: colorOf((p.barIndex ?? 0) % 4) }))} initial={[]} startInSource onClose={() => setWorkspaceGrid(null)} onDone={maker => {
      const used = [...new Set(maker.slots.flatMap(s => s.kind === 'chop' ? [s.chop] : []))];
      const selectedPlans: SectionPlan[] = used.map((i, index) => { const c = maker.chops[i]; return { start: c.start, length: c.length, audioFrames: c.length, bars: c.bars, barIndex: c.barIndex, colorIndex: c.colorIndex, index }; });
      // A silence-only pattern still needs a source pad for Koala's chopper.
      if (!selectedPlans.length) selectedPlans.push({ start: 0, length: 1, audioFrames: 1, bars: 1, index: 0 });
      return onConfirm({ bpm: bpmAt(workspaceGrid, 0), beatsPerBar, plans: selectedPlans, key: detectedKey, maker });
    }} />;
  }

  return (
    <div className="palette-backdrop chop-backdrop" onClick={askClose}>
      <div className="chop" role="dialog" aria-label="Chop song to patterns" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>
            Chop the song<span className="chop__version">v{__APP_VERSION__}</span>
          </span>
          <button onClick={askClose} aria-label="Close">
            X
          </button>
        </div>
        <div className="chop__scroll">
          <p className="chop__note">{note}</p>
          {fine && <button className="chop__btn" disabled={!grid} onClick={() => {
            if (!grid) return;
            player.stop();
            setWorkspaceGrid(grid);
          }}>Open section workspace · 1–16 bars</button>}

          <div className="chop__screen">
            <ChopTimeline ref={timeline} pyramid={pyramid} sampleRate={sampleRate} grid={grid} chops={chopFrames} downbeats={[]} oneOne={detectionAnchor === null ? null : detectionAnchor + (marks.gridOffsetFrames ?? 0)} sections={drawnSections} magnetOn={magnetOn} fine={fine} onScrub={scrubStart} onScrubEnd={scrubEnd} />
            <div className="chop__readout">
              <button className={`chop__nudge${marks.oneOne !== null && marks.bpm == null ? " chop__nudge--on" : ""}`} disabled={!grid || marks.bpm == null} onClick={autoTempo} aria-pressed={marks.oneOne !== null && marks.bpm == null} aria-label="Automatic tempo">
                <AutoIcon />
              </button>
              <button className="chop__nudge" disabled={!grid} onPointerDown={nudgeStart(-1)} onPointerUp={nudgeStop} onPointerCancel={nudgeStop} onContextMenu={(e) => e.preventDefault()} aria-label="Tempo down by 0.01">
                <NudgeIcon plus={false} />
              </button>
              <span className="chop__bpm" onPointerDown={bpmDown} onPointerMove={bpmMove} onPointerUp={bpmUp} onPointerCancel={() => ((bpmTouch.current = null), setLiveBpm(null))} title="BPM. Double tap: nearest whole BPM. Drag left or right to scrub; slower toward the bottom of the screen.">
                {bpmText}
              </span>
              <button className="chop__nudge" disabled={!grid} onPointerDown={nudgeStart(1)} onPointerUp={nudgeStop} onPointerCancel={nudgeStop} onContextMenu={(e) => e.preventDefault()} aria-label="Tempo up by 0.01">
                <NudgeIcon plus />
              </button>
            </div>
          </div>

          <div className="chop__row">
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => scaleTempo(0.5)} title="Half the tempo: the grid has a line for every two of its beats" aria-label="Half the tempo">
              ÷2
            </button>
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => scaleTempo(2)} title="Double the tempo: the grid has two lines for every one of its beats" aria-label="Double the tempo">
              ×2
            </button>
            <button className="chop__btn chop__grow" aria-pressed={magnetOn} onClick={() => setMagnetOn((on) => !on)} title="When you let go, lets the line glide onto the nearest grid line: bar lines, and in chopper mode beats, eighths and sixteenths as you zoom in (never finer; every fourth bar when zoomed out). Turn it off to place a marker exactly where the sound is.">
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
            <button className="chop__btn chop__grow" disabled={!grid} onClick={placeAnchor} title="Replaces the single downbeat anchor and re-detects BPM from it. Snap on selects a beat; Snap off uses the exact playhead.">
              Anchor
            </button>
          </div>
          <div className="chop__row">
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => nudgeGrid(-1)} aria-label="Nudge grid earlier by 1 millisecond">Nudge grid −</button>
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => nudgeGrid(1)} aria-label="Nudge grid later by 1 millisecond">Nudge grid +</button>
          </div>
          <div className="chop__row">
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => chopEvery(8)} title="Puts a chop marker every 8 bars across the whole song and chops the vocal into patterns.">
              Chop by 8
            </button>
            <button className="chop__btn chop__grow" disabled={!grid} onClick={() => chopEvery(16)} title="Puts a chop marker every 16 bars across the whole song and chops the vocal into patterns.">
              Chop by 16
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
                    <span className="chop__bin-bars">{!fine && tooLong(grid, s) ? `${barsText(barsIn(grid, s))}, max ${MAX_SECTION_BARS}` : barsText(barsIn(grid, s))}</span>
                  </button>
                </div>
              ))
            )}
          </div>

        </div>

        {unit === "chop" && (
          <button className="chop__btn" disabled={plans.length === 0 || fits === 0 || longOnes.length > 0} onClick={() => grid && onConfirm({ bpm: tempo, grid, beatsPerBar, plans, key: detectedKey }, true)}>
            Finish and open pattern maker
          </button>
        )}
        <button className="chop__go" disabled={plans.length === 0 || fits === 0 || longOnes.length > 0} onClick={() => grid && onConfirm({ bpm: tempo, grid, beatsPerBar, plans, key: detectedKey })}>
          Chop into {fits} {unit}{fits === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
