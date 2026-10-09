import {
  applyRhythm,
  rhythmLength,
  type RhythmPattern,
} from "../audio/song/rhythmLengths";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  noteOptions,
  tripletProgress,
  quantizeNote,
  SHORTEST_NOTE,
} from "../audio/song/noteLengths";
import { getAudioContext } from "../audio/decode";
import { chopColor } from "../audio/palettes";
import {
  orderChops,
  positionText,
  slotStarts,
  stepsPerBar,
  type MakerChop,
  type Slot,
} from "../audio/song/patternMaker";
import {
  placeCandidate,
  clamp,
  mod,
  nextOffset,
  trimPrevious,
  rewindLastBar,
  slotFades,
  sourceCandidates,
  type WorkspaceResult,
  type WorkspaceState,
} from "../audio/song/sectionWorkspace";
import { baseGrid, startHistory, commit, undo } from "../audio/song/chopMarks";
import { fineLineNear, lineFrame, type TapGrid } from "../audio/song/tapGrid";
import { buildPyramid, columnPeaks } from "../audio/song/waveform";
import { useChopAudition, type AuditionPiece } from "./useChopAudition";
import "./SectionWorkspace.css";
import { WildcardPicker } from "./WildcardPicker";

interface Props {
  channelData: Float32Array[];
  sampleRate: number;
  beatFrames: number;
  beatsPerBar: number;
  chops: MakerChop[];
  initial: Slot[];
  colors: readonly string[];
  grid?: TapGrid;
  rhythm?: RhythmPattern;
  pitch?: number;
  startInSource?: boolean;
  onDone: (result: WorkspaceResult) => void | Promise<void>;
  onClose: () => void;
}
interface Finger {
  id: number;
  x: number;
  y: number;
  pos: number;
  point: number;
  axis: "x" | "y" | null;
  dx: number;
  lastY: number;
  time: number;
  velocity: number;
  trimDistance: number;
}

/** Shared source cutter and rearranger. Musical positions stay in steps; sample boundaries stay in frames. */
export function SectionWorkspace({
  channelData,
  sampleRate,
  beatFrames,
  beatsPerBar,
  chops,
  initial,
  colors,
  grid: suppliedGrid,
  rhythm: initialRhythm,
  pitch = 0,
  startInSource = false,
  onDone,
  onClose,
}: Props) {
  const grid = useMemo(
    () =>
      suppliedGrid ??
      baseGrid(
        sampleRate,
        beatsPerBar,
        (60 * sampleRate) / beatFrames,
        (chops.length
          ? chops[0].start - chops[0].barIndex * beatsPerBar * beatFrames
          : 0) / sampleRate,
      ),
    [suppliedGrid, sampleRate, beatsPerBar, beatFrames, chops],
  );
  const phases = useMemo(
    () => [0, 1, 2, 3].map((i) => chopColor(colors, i)),
    [colors],
  );
  const [history, setHistory] = useState(() =>
    startHistory<WorkspaceState>({
      chops,
      slots: initial,
      cuts: [],
      rhythm: initialRhythm,
    }),
  );
  const state = history.present;
  const [configOpen, setConfigOpen] = useState(false);
  const [editAt, setEditAt] = useState<number | null>(
    initialRhythm?.enabled && initial.length ? 0 : null,
  );
  const editIndex =
    editAt !== null && editAt < state.slots.length ? editAt : null;
  const priorSlots =
    editIndex === null ? state.slots : state.slots.slice(0, editIndex);
  const timeline = slotStarts(state.slots);
  const sequenceTotal = timeline.total;
  const total = editIndex === null ? sequenceTotal : timeline.starts[editIndex];
  const [mode, setMode] = useState<"source" | "pattern">(
    startInSource ? "source" : "pattern",
  );
  const [wildcard, setWildcard] = useState<MakerChop | null>(null);
  const [library, setLibrary] = useState(false);
  const [libraryLength, setLibraryLength] = useState<number | null>(null);
  const [bars, setBars] = useState(initialRhythm?.bars ?? 4);
  const [point, setPoint] = useState(0);
  const lengths = useMemo(() => noteOptions(beatsPerBar), [beatsPerBar]);
  const [wanted, setWanted] = useState(stepsPerBar(beatsPerBar));
  const rhythm = state.rhythm;
  const rhythmActive = !!rhythm?.enabled && !!rhythm.markers.length;
  const selectionLength =
    mode === "pattern" && rhythmActive
      ? rhythmLength(
          rhythm!.markers,
          rhythm!.bars * stepsPerBar(beatsPerBar),
          total,
        )
      : wanted;
  const lengthView = useRef({ total: -1, length: 0 });
  const [selected, setSelected] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const sectionSteps = bars * stepsPerBar(beatsPerBar);
  const offset =
    mode === "pattern" && rhythmActive
      ? mod(total, sectionSteps)
      : mode === "source" || (!priorSlots.length && editIndex === null)
        ? point
        : !priorSlots.length && editIndex !== null
          ? mod(
              state.slots[0].kind === "chop"
                ? (state.slots[0].alignedStart ??
                    fineLineNear(
                      grid,
                      state.chops[state.slots[0].chop].start,
                      48,
                    ) * 4)
                : point,
              sectionSteps,
            )
          : nextOffset({ ...state, slots: priorSlots }, sectionSteps, grid);
  const rows = useMemo(() => {
    if (mode === "pattern" && library && state.chops.length)
      return orderChops(state.chops, slotStarts(state.slots).total, beatsPerBar)
        .reverse()
        .map((i) => state.chops[i]);
    return sourceCandidates(
      grid,
      channelData[0].length,
      bars,
      mode === "source" ? 0 : offset,
      mode === "source" ? sectionSteps : selectionLength,
      phases,
    )
      .map((c) =>
        rhythmActive && mode === "pattern"
          ? {
              ...c,
              steps: selectionLength,
              bars: selectionLength / stepsPerBar(beatsPerBar),
            }
          : c,
      )
      .reverse();
  }, [
    mode,
    library,
    state.chops,
    state.slots,
    beatsPerBar,
    grid,
    channelData,
    bars,
    offset,
    sectionSteps,
    selectionLength,
    rhythmActive,
    phases,
  ]);
  const index = clamp(selected, 0, Math.max(0, rows.length - 1));
  const active = rows[index];
  const candidate =
    active && mode === "source"
      ? sourceCandidates(
          grid,
          channelData[0].length,
          bars,
          point,
          Math.min(selectionLength, sectionSteps - point),
          phases,
        ).find(
          (c) =>
            Math.floor(c.barIndex / bars) ===
            Math.floor(active.barIndex / bars),
        )
      : active && (libraryLength !== null || rhythmActive) && library
        ? {
            ...active,
            steps: Math.min(
              active.steps,
              rhythmActive ? selectionLength : libraryLength!,
            ),
            length: Math.round(
              (active.length *
                Math.min(
                  active.steps,
                  rhythmActive ? selectionLength : libraryLength!,
                )) /
                active.steps,
            ),
          }
        : active;

  const audio = useChopAudition(channelData, sampleRate, beatFrames, pitch);
  const pyramid = useMemo(() => buildPyramid(channelData), [channelData]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const finger = useRef<Finger | null>(null);
  const position = useRef(0),
    span = useRef(sectionSteps);
  const lastBrowse = useRef({ stamp: "", at: 0 });
  const initialized = useRef(false);
  const [sizeVersion, setSizeVersion] = useState(0);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSizeVersion((v) => v + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!initialized.current && rows.length) {
      initialized.current = true;
      position.current = rows.length - 1;
      setSelected(rows.length - 1);
    }
  }, [rows.length]);
  const last = priorSlots.at(-1);
  const trimDistance =
    finger.current?.trimDistance ?? (canvas.current?.clientWidth ?? 374) * 0.34;
  const removeArmed = !!last && dragX >= trimDistance;
  const previewSlots =
    dragX > 10 && last
      ? removeArmed
        ? rewindLastBar(priorSlots, beatsPerBar)
        : trimPrevious(priorSlots, selectionLength)
      : priorSlots;
  const trim = previewSlots.at(-1)?.steps;
  const paint = useRef<() => void>(() => {});
  paint.current = () => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const w = el.clientWidth,
      h = el.clientHeight,
      ratio = Math.min(3, window.devicePixelRatio || 1);
    if (
      el.width !== Math.round(w * ratio) ||
      el.height !== Math.round(h * ratio)
    ) {
      el.width = Math.round(w * ratio);
      el.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(el),
      ink = style.color,
      muted =
        getComputedStyle(el.parentElement!).getPropertyValue("--ink3").trim() ||
        "#92999d";
    ctx.clearRect(0, 0, w, h);
    const join = w * (mode === "source" ? 0.1 : 0.5),
      fit = mode === "source" ? w - join - 12 : ((w - join - 12) * 2) / 3,
      center = h / 2;
    const target =
      mode === "source"
        ? sectionSteps
        : Math.max(SHORTEST_NOTE, candidate?.steps ?? selectionLength);
    if (lengthView.current.total !== total) {
      lengthView.current = { total, length: target };
    }
    const viewSteps = Math.max(SHORTEST_NOTE, lengthView.current.length);
    const gridWidth = (w - join - 12) / 3;
    const gridSteps = Math.max(4, viewSteps / 2);
    const aheadX = (steps: number) =>
      join +
      (steps <= viewSteps
        ? (steps * fit) / viewSteps
        : fit + ((steps - viewSteps) * gridWidth) / gridSteps);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finger.current)
      position.current += (index - position.current) * (reduce ? 1 : 0.22);
    span.current += (target - span.current) * (reduce ? 1 : 0.2);
    const shift = Math.min(0, dragX);
    const historyPx = join / stepsPerBar(beatsPerBar);
    const eaten = trimDistance;
    const resisted = dragX <= eaten ? dragX : eaten + (dragX - eaten) * 0.34;
    const candidateShift = shift + Math.min(18, Math.max(0, resisted) * 0.12);
    const wave = (
      c: MakerChop | null,
      x: number,
      y: number,
      width: number,
      height: number,
      alpha: number,
      steps = c?.steps ?? 1,
    ) => {
      if (width <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c ? phases[mod(c.barIndex, 4)] : muted;
      ctx.globalAlpha = alpha * 0.16;
      ctx.fillRect(x, y - height / 2, width, height);
      ctx.globalAlpha = alpha;
      if (c) {
        const columns = Math.max(1, Math.ceil(width / 2)),
          lo = new Float32Array(columns),
          hi = new Float32Array(columns);
        columnPeaks(
          pyramid,
          c.start,
          (c.length * steps) / c.steps,
          columns,
          lo,
          hi,
        );
        for (let j = 0; j < columns; j++) {
          const bar = Math.floor(
            (c.barIndex * stepsPerBar(beatsPerBar) + (j / columns) * steps) /
              stepsPerBar(beatsPerBar),
          );
          ctx.fillStyle = phases[mod(bar, 4)];
          const peak = Math.min(
            1,
            Math.max(-lo[j], hi[j]) / Math.max(0.001, pyramid.peak),
          );
          ctx.fillRect(
            x + (j / columns) * width,
            y - peak * height * 0.43,
            Math.max(1, (width / columns) * 0.7),
            Math.max(1, peak * height * 0.86),
          );
        }
      }
      ctx.restore();
    };
    ctx.font = "11px Barlow Semi Condensed, sans-serif";
    if (mode === "pattern" && audio.position?.kind === "sequence") {
      const playingAt = audio.position.steps;
      const timelineX = (step: number) => join + (step - playingAt) * historyPx;
      let at = 0;
      for (const slot of state.slots) {
        const x = timelineX(at),
          width = slot.steps * historyPx;
        if (x + width >= 0 && x <= w) {
          wave(
            slot.kind === "chop" ? state.chops[slot.chop] : null,
            x,
            center,
            width - 1,
            88,
            0.85,
            slot.steps,
          );
        }
        at += slot.steps;
      }
      const lo = Math.max(
        0,
        Math.floor((playingAt - join / historyPx) / 2) * 2,
      );
      const hi = Math.min(sequenceTotal, playingAt + (w - join) / historyPx);
      for (let step = lo; step <= hi; step += 2) {
        const barLine = step % stepsPerBar(beatsPerBar) === 0;
        const height = barLine ? 128 : step % 4 === 0 ? 88 : 44;
        ctx.fillStyle = muted;
        ctx.globalAlpha = barLine ? 0.85 : 0.3;
        ctx.fillRect(
          timelineX(step),
          center - height / 2,
          barLine ? 2 : 1,
          height,
        );
        if (barLine)
          ctx.fillText(
            `BAR ${step / stepsPerBar(beatsPerBar) + 1}`,
            timelineX(step) + 3,
            center - 68,
          );
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.fillRect(join - 1, center - 58, 2, 116);
      ctx.beginPath();
      ctx.arc(join, center + 58, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(
        `PLAYING ${positionText(playingAt, beatsPerBar)}`,
        12,
        h - 18,
      );
      return;
    }
    // History is clipped left of the join. It never shares the candidate's pointer handlers.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, center - 48, join + shift, 96);
    ctx.clip();
    let edge = join + shift;
    for (let i = previewSlots.length - 1; i >= 0 && edge > -w; i--) {
      const slot = previewSlots[i],
        length = slot.steps;
      const width = length * historyPx;
      edge -= width;
      wave(
        slot.kind === "chop" ? state.chops[slot.chop] : null,
        edge,
        center,
        width - 2,
        88,
        0.6,
        length,
      );
    }
    ctx.restore();
    const visible = [];
    for (
      let i = Math.max(0, Math.floor(position.current) - 4);
      i <= Math.min(rows.length - 1, Math.ceil(position.current) + 4);
      i++
    ) {
      const d = (i - position.current) * 52,
        mag = Math.exp(-((d / 55) ** 2));
      visible.push({ i, y: center + d + 38 * Math.tanh(d / 52), mag });
    }
    visible.sort((a, b) => a.mag - b.mag);
    for (const row of visible) {
      const c =
          row.i === index && mode === "pattern"
            ? (candidate ?? rows[row.i])
            : rows[row.i],
        height = 44 + 44 * row.mag,
        width =
          (mode === "source" ? fit : aheadX(span.current) - join) *
          (0.55 + 0.45 * row.mag);
      const alpha = 0.3 + 0.7 * Math.exp(-Math.abs(row.y - center) / 180);
      wave(c, join + candidateShift, row.y, width, height, alpha);
      ctx.fillStyle = ink;
      ctx.globalAlpha = alpha;
      ctx.fillText(
        `BAR ${c.barIndex + 1}`,
        join + candidateShift + 5,
        row.y - height / 2 + 12,
      );
      ctx.globalAlpha = 1;
    }
    const cursor =
      mode === "source" ? join + (point / sectionSteps) * fit : join;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(cursor - 1, center - 55, 2, 110);
    ctx.globalAlpha = 1;
    if (mode === "source" && active) {
      for (const cut of state.cuts) {
        const local = cut - Math.floor(active.barIndex / bars) * sectionSteps;
        if (local < 0 || local > sectionSteps) continue;
        ctx.fillStyle =
          phases[mod(Math.floor(cut / stepsPerBar(beatsPerBar)), 4)];
        ctx.fillRect(join + (local / sectionSteps) * fit, center - 47, 2, 94);
      }
    }
    if (mode === "pattern") {
      const gridStart = total + viewSteps;
      const gridEnd = gridStart + gridSteps;
      ctx.fillStyle = muted;
      ctx.globalAlpha = 0.05;
      ctx.fillRect(join + fit, 0, gridWidth, h);
      for (
        let step = Math.ceil((gridStart - 1e-8) / 2) * 2;
        step <= gridEnd + 1e-8;
        step += 2
      ) {
        const barLine =
          Math.abs(
            step / stepsPerBar(beatsPerBar) -
              Math.round(step / stepsPerBar(beatsPerBar)),
          ) < 1e-8;
        const quarter = step % 4 === 0;
        const x = aheadX(step - total);
        const height = barLine ? 128 : quarter ? 88 : 44;
        ctx.globalAlpha = barLine ? 0.85 : quarter ? 0.5 : 0.3;
        ctx.fillRect(x, center - height / 2, barLine ? 2 : 1, height);
        if (barLine)
          ctx.fillText(
            `BAR ${Math.round(step / stepsPerBar(beatsPerBar)) + 1}`,
            Math.min(x + 3, w - 40),
            center - 68,
          );
      }
      ctx.globalAlpha = 1;
      const end = total + target;
      const barSteps = stepsPerBar(beatsPerBar);
      const boundary = Math.ceil((end - 1e-8) / barSteps) * barSteps;
      const gap = boundary - end;
      const highlighted = gap > 1e-8 && gap <= 4;
      const marker = highlighted ? boundary : end;
      const x = aheadX(marker - total);
      const completedBars = Math.round(boundary / barSteps);
      const milestone = [2, 4, 8, 16].includes(completedBars);
      ctx.fillStyle = highlighted ? (milestone ? "#f0cd82" : ink) : muted;
      ctx.globalAlpha = highlighted ? 1 : 0.45;
      ctx.fillRect(x - 1, center - 52, highlighted ? 2 : 1, 104);
      ctx.textAlign = "right";
      ctx.fillText(
        highlighted
          ? `${completedBars} BARS · +${(gap / 4).toFixed(2)} BEAT`
          : `END ${positionText(end, beatsPerBar)}`,
        Math.min(w - 8, x),
        center + 67,
      );
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
    if (dragX < 0 && mode === "pattern") {
      ctx.fillStyle = phases[mod(active?.barIndex ?? 0, 4)];
      ctx.fillRect(join, center + 54, fit * Math.min(1, -dragX / 84), 2);
    }
    // The playback dot follows AudioContext time. The finger cursor remains independent above.
    if (audio.position) {
      let x = join;
      if (mode === "source")
        x = join + ((point + audio.position.steps) / sectionSteps) * fit;
      else if (audio.position.kind === "sequence")
        x = join + (audio.position.steps - total) * historyPx;
      else
        x =
          join +
          (audio.position.steps < 0
            ? audio.position.steps * historyPx
            : aheadX(audio.position.steps) - join);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(clamp(x, 3, w - 3), center + 48, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = muted;
    ctx.fillText("↓ LATER SECTIONS", 12, 22);
    ctx.fillText("↑ EARLIER SECTIONS", 12, h - 18);
    ctx.fillText(
      mode === "source"
        ? "MOVE TO POSITION · TAP TO CUT"
        : dragX <= -trimDistance
          ? "RELEASE FOR SILENCE"
          : "← CONFIRM / SILENCE",
      12,
      h - 42,
    );
    if (mode === "pattern") {
      ctx.textAlign = "right";
      ctx.fillStyle = removeArmed ? "#e08079" : muted;
      ctx.fillText(
        removeArmed
          ? "RELEASE TO BAR START"
          : dragX > 0
            ? `TRIM ${selectionLength / 4} BEAT`
            : "TRIM / REWIND →",
        w - 12,
        h - 42,
      );
      ctx.textAlign = "left";
    }
  };
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      paint.current();
      const target =
        mode === "source"
          ? sectionSteps
          : Math.max(SHORTEST_NOTE, candidate?.steps ?? selectionLength);
      if (
        finger.current ||
        Math.abs(position.current - index) > 0.005 ||
        Math.abs(span.current - target) > 0.005
      )
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    rows,
    index,
    mode,
    sectionSteps,
    candidate?.steps,
    selectionLength,
    dragX,
    trim,
    removeArmed,
    state,
    audio.position,
    point,
    phases,
    sizeVersion,
  ]);
  const change = (next: WorkspaceState) => {
    audio.stop();
    setHistory((h) => commit(h, next));
  };
  const confirm = () => {
    if (!candidate) return;
    change(placeCandidate(state, candidate, editIndex));
    if (editIndex !== null) navigate(1);
    setNotice(
      editIndex === null
        ? "Piece confirmed · alternatives follow its endpoint"
        : "Chop replaced · remaining sequence preserved",
    );
  };
  const addSilence = () => {
    const slots = state.slots.slice();
    const slot: Slot = { kind: "silence", steps: selectionLength };
    if (editIndex === null) slots.push(slot);
    else slots.splice(editIndex, 1, slot);
    change({ ...state, slots });
    if (editIndex !== null) navigate(1);
    setNotice("Silence inserted at selected length · Undo available");
  };
  const navigate = (direction: -1 | 1) => {
    audio.stop();
    const next = clamp(
      (editIndex ?? state.slots.length) + direction,
      0,
      state.slots.length,
    );
    setEditAt(next === state.slots.length ? null : next);
    const slot = state.slots[next];
    if (slot) {
      setWanted(slot.steps);
      setLibraryLength(slot.steps);
      setLibrary(false);
      if (slot.kind === "chop") {
        const count = sourceCandidates(
          grid,
          channelData[0].length,
          bars,
          0,
          sectionSteps,
          phases,
        ).length;
        setSelected(
          Math.max(
            0,
            count - 1 - Math.floor(state.chops[slot.chop].barIndex / bars),
          ),
        );
      }
    }
    setNotice(
      next === state.slots.length
        ? "At sequence end · add the next chop"
        : `Editing chop ${next + 1} · confirm to replace`,
    );
  };
  const cut = () => {
    if (!active) return;
    const absolute = Math.floor(active.barIndex / bars) * sectionSteps + point;
    const cuts = [...new Set([...state.cuts, absolute])].sort((a, b) => a - b);
    const previous = cuts.filter((c) => c < absolute).at(-1);
    let next = { ...state, cuts };
    if (previous !== undefined) {
      const start = Math.round(lineFrame(grid, previous / 4)),
        end = Math.round(lineFrame(grid, absolute / 4));
      const steps = absolute - previous,
        barIndex = Math.floor(previous / stepsPerBar(beatsPerBar));
      const piece: MakerChop = {
        start,
        length: end - start,
        steps,
        bars: steps / stepsPerBar(beatsPerBar),
        slice: state.chops.length,
        barIndex,
        colorIndex: mod(barIndex, 4),
        color: phases[mod(barIndex, 4)],
      };
      if (start >= 0 && end > start && end <= channelData[0].length) {
        next = { ...next, chops: [...next.chops, piece] };
        setWanted(steps);
      }
    }
    change(next);
    setNotice(`Cut at ${positionText(absolute, beatsPerBar)}`);
  };
  const browse = (c: MakerChop | undefined, at = point) => {
    if (c && mode === "source") {
      const step = c.barIndex * stepsPerBar(beatsPerBar) + at;
      const start = Math.round(lineFrame(grid, step / 4));
      const end = Math.min(
        channelData[0].length,
        Math.round(lineFrame(grid, (step + 4) / 4)),
      );
      c = {
        ...c,
        start,
        length: Math.max(1, end - start),
        steps: Math.min(4, sectionSteps - at),
      };
    }
    if (!c) return;
    const stamp = `${c.start}:${c.steps}`,
      now = performance.now();
    if (stamp === lastBrowse.current.stamp || now - lastBrowse.current.at < 85)
      return;
    lastBrowse.current = { stamp, at: now };
    void audio.play(
      [{ chop: c, steps: Math.min(c.steps, mode === "source" ? 4 : c.steps) }],
      "browse",
    );
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (saving || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Let the system own gestures at the outer screen edges; this working canvas is inset.
    setConfigOpen(false);
    void getAudioContext().resume();
    e.currentTarget.setPointerCapture(e.pointerId);
    finger.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      pos: position.current,
      point,
      axis: null,
      dx: 0,
      lastY: e.clientY,
      time: performance.now(),
      velocity: 0,
      trimDistance,
    };
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const f = finger.current;
    if (!f || f.id !== e.pointerId) return;
    const dx = e.clientX - f.x,
      dy = e.clientY - f.y;
    if (!f.axis && Math.hypot(dx, dy) > 8)
      f.axis = Math.abs(dy) > Math.abs(dx) * 1.15 ? "y" : "x";
    if (f.axis === "y") {
      const now = performance.now();
      f.velocity = (e.clientY - f.lastY) / Math.max(8, now - f.time);
      f.lastY = e.clientY;
      f.time = now;
      position.current = clamp(f.pos - dy / 52, 0, rows.length - 1);
      const next = Math.round(position.current);
      setSelected(next);
      browse(rows[next]);
    } else if (f.axis === "x") {
      if (mode === "source") {
        const next = clamp(
          Math.round(
            f.point - (dx / e.currentTarget.clientWidth / 0.65) * sectionSteps,
          ),
          0,
          sectionSteps - 1,
        );
        setPoint(next);
        browse(active, next);
      } else {
        f.dx = dx;
        setDragX(dx);
      }
    }
  };
  const release = (cancel = false) => {
    const f = finger.current;
    finger.current = null;
    if (!f) return;
    if (cancel) {
      setDragX(0);
      setPoint(f.point);
      audio.stop();
      return;
    }
    if (f.axis === "y") {
      const next = Math.round(
        clamp(
          position.current - clamp(f.velocity, -1, 1) * 1.4,
          0,
          rows.length - 1,
        ),
      );
      setSelected(next);
      browse(rows[next]);
      if (rhythmActive && editIndex !== null && rows[next]) {
        const picked = { ...rows[next], steps: selectionLength };
        change(placeCandidate(state, picked, editIndex, offset));
        setNotice(
          `Chop ${editIndex + 1} source replaced · rhythm length preserved`,
        );
      }
    } else if (f.axis === "x" && mode === "pattern") {
      if (f.dx <= -f.trimDistance) addSilence();
      else if (f.dx < -10) confirm();
      else if (f.dx > 10 && last) {
        audio.stop();
        const rewind = f.dx >= f.trimDistance;
        const slots = rewind
          ? rewindLastBar(priorSlots, beatsPerBar)
          : trimPrevious(priorSlots, selectionLength);
        change({
          ...state,
          slots: [
            ...slots,
            ...(editIndex === null ? [] : state.slots.slice(editIndex)),
          ],
        });
        setEditAt(null);
        setNotice(
          rewind
            ? "Rewound to bar start · Undo available"
            : "Trimmed by selected length · Undo available",
        );
      }
    } else if (!f.axis) {
      if (mode === "source") cut();
      else if (candidate)
        void audio.play(
          [{ chop: candidate, steps: candidate.steps }],
          "candidate",
        );
    }
    setDragX(0);
  };
  useEffect(() => {
    const cancel = () => {
      finger.current = null;
      setDragX(0);
    };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  const pieces = (): AuditionPiece[] =>
    state.slots.map((s, i) => ({
      ...slotFades(state.slots, i),
      chop: s.kind === "chop" ? state.chops[s.chop] : undefined,
      steps: s.steps,
    }));
  const previewJoin = () => {
    if (!candidate) return;
    let remaining = 4;
    const lead: AuditionPiece[] = [];
    for (let i = priorSlots.length - 1; i >= 0 && remaining > 0; i--) {
      const s = priorSlots[i],
        steps = Math.min(remaining, s.steps);
      lead.unshift({
        ...slotFades(state.slots, i),
        chop: s.kind === "chop" ? state.chops[s.chop] : undefined,
        steps,
        skip: s.steps - steps,
      });
      remaining -= steps;
    }
    void audio.play(
      [
        ...lead,
        {
          chop: candidate,
          steps: candidate.steps,
          fadeIn: last?.kind === "silence" ? 0.003 : 0.002,
        },
      ],
      "join",
      -(4 - remaining),
    );
  };
  const updateRhythm = (markers: number[], enabled = markers.length > 0) => {
    const next: RhythmPattern = { bars, markers, enabled };
    const updated = applyRhythm(
      state,
      next,
      grid,
      channelData[0].length,
      phases,
    );
    change(updated);
    setLibrary(false);
    if (enabled)
      setEditAt(
        updated.slots.length
          ? Math.min(editIndex ?? 0, updated.slots.length - 1)
          : null,
      );
    setNotice(
      enabled
        ? "Rhythm lengths active · source choices stay editable"
        : "Rhythm lengths disabled",
    );
  };
  const askClose = () => {
    audio.stop();
    if (
      !history.past.length ||
      window.confirm("Close this workspace and discard its unsaved edits?")
    )
      onClose();
  };
  const hold = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!candidate) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    void audio.play([{ chop: candidate, steps: candidate.steps }], "candidate");
  };
  const chooseBars = (n: number) => {
    audio.stop();
    const absolute = active
      ? Math.floor(active.barIndex / bars) * sectionSteps + point
      : point;
    setBars(n);
    if (rhythm)
      change(
        applyRhythm(
          state,
          {
            ...rhythm,
            bars: n,
            markers: rhythm.markers,
          },
          grid,
          channelData[0].length,
        ),
      );
    setPoint(mod(absolute, n * stepsPerBar(beatsPerBar)));
    setSelected(
      Math.max(
        0,
        Math.ceil(channelData[0].length / (n * beatsPerBar * beatFrames)) -
          1 -
          Math.floor(absolute / (n * stepsPerBar(beatsPerBar))),
      ),
    );
  };
  const finish = async () => {
    if (!state.slots.length || saving) return;
    audio.stop();
    setSaving(true);
    try {
      await onDone({
        chops: state.chops,
        slots: state.slots,
        grid,
        rhythm: state.rhythm,
      });
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "The pattern could not be saved",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="palette-backdrop section-backdrop" onClick={askClose}>
      <div
        className="section-workspace"
        role="dialog"
        aria-modal="true"
        aria-label="Song section workspace"
        onClick={(e) => e.stopPropagation()}
      >
        {wildcard && (
          <WildcardPicker
            section={wildcard}
            bars={bars}
            interval={selectionLength}
            offset={offset}
            grid={grid}
            pyramid={pyramid}
            colors={phases}
            onCancel={() => {
              audio.stop();
              setWildcard(null);
            }}
            onPreview={(chop) =>
              void audio.play([{ chop, steps: chop.steps }], "candidate")
            }
            onInsert={(chop) => {
              change(placeCandidate(state, chop, editIndex, offset));
              if (editIndex !== null)
                setEditAt(
                  editIndex + 1 < state.slots.length ? editIndex + 1 : null,
                );
              setWildcard(null);
              setLibrary(false);
              setNotice("Wildcard inserted · aligned source browsing resumed");
            }}
          />
        )}
        <div className="chop__head">
          <span>
            {mode === "source" ? "Song sections" : "Chop rearranger"}
            <span className="chop__version">v{__APP_VERSION__}</span>
          </span>
          <button onClick={askClose} aria-label="Close workspace">
            ×
          </button>
        </div>
        {mode === "pattern" && (
          <div
            className="section-rhythm"
            role="group"
            aria-label="Repeating chop rhythm"
          >
            <div className="section-rhythm__head">
              <button
                className="chop__btn"
                aria-label="Rhythm lengths"
                aria-pressed={rhythmActive}
                disabled={!rhythm?.markers.length}
                onClick={() => updateRhythm(rhythm!.markers, !rhythmActive)}
              >
                Rhythm · {bars} {bars === 1 ? "bar" : "bars"}
              </button>
              <span>
                {rhythmActive
                  ? `${selectionLength / 4} beat next`
                  : "Tap chop starts"}
              </span>
              <button
                className="chop__btn"
                aria-label="Clear rhythm"
                disabled={!rhythm?.markers.length}
                onClick={() => updateRhythm([], false)}
              >
                ×
              </button>
            </div>
            <div className="section-rhythm__steps">
              {Array.from({ length: 16 }, (_, step) => (
                <button
                  key={step}
                  className="chop__btn"
                  aria-label={`Rhythm step ${step + 1}`}
                  aria-pressed={!!rhythm?.markers.includes(step)}
                  data-bar-start={((step * bars) / 16) % 1 === 0}
                  onClick={() =>
                    updateRhythm(
                      rhythm?.markers.includes(step)
                        ? rhythm.markers.filter((n) => n !== step)
                        : [...(rhythm?.markers ?? []), step],
                    )
                  }
                >
                  {(step % stepsPerBar(beatsPerBar)) + 1}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="section-top-tools">
          <button
            className="chop__btn section-config-toggle"
            aria-label="Workspace options"
            aria-expanded={configOpen}
            onClick={() => setConfigOpen((open) => !open)}
          >
            +
          </button>
          {mode === "pattern" && (
            <>
              {" "}
              <button
                className="chop__btn"
                disabled={!active}
                onClick={() => {
                  audio.stop();
                  const section = sourceCandidates(
                    grid,
                    channelData[0].length,
                    bars,
                    0,
                    sectionSteps,
                    phases,
                  ).find(
                    (c) =>
                      Math.floor(c.barIndex / bars) ===
                      Math.floor(active.barIndex / bars),
                  );
                  if (section) setWildcard(section);
                }}
              >
                Wildcard
              </button>
            </>
          )}
        </div>
        {configOpen && (
          <div
            className="section-config"
            role="region"
            aria-label="Workspace options"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setConfigOpen(false);
                e.stopPropagation();
              }
            }}
          >
            <div className="chop__head">
              <span>Workspace options</span>
              <button
                aria-label="Close options"
                onClick={() => setConfigOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="section-tabs" aria-label="Section length">
              {[1, 2, 4, 8, 16].map((n) => (
                <button
                  key={n}
                  className="chop__btn"
                  aria-pressed={bars === n}
                  onClick={() => chooseBars(n)}
                >
                  {n} {n === 1 ? "bar" : "bars"}
                </button>
              ))}
            </div>
            <div className="section-actions">
              <button
                className="chop__btn"
                aria-pressed={mode === "source"}
                onClick={() => {
                  audio.stop();
                  setMode("source");
                  setEditAt(null);
                  setConfigOpen(false);
                }}
              >
                Song cuts
              </button>
              <button
                className="chop__btn"
                aria-pressed={mode === "pattern"}
                onClick={() => {
                  audio.stop();
                  setMode("pattern");
                  setConfigOpen(false);
                }}
              >
                Pattern maker
              </button>
            </div>
            {mode === "pattern" && (
              <div className="section-actions">
                <button
                  className="chop__btn"
                  aria-pressed={!library}
                  onClick={() => {
                    audio.stop();
                    setLibrary(false);
                    setConfigOpen(false);
                  }}
                >
                  Source sections
                </button>
                <button
                  className="chop__btn"
                  aria-pressed={library}
                  disabled={rhythmActive || !state.chops.length}
                  onClick={() => {
                    audio.stop();
                    setLibrary(true);
                    setConfigOpen(false);
                  }}
                >
                  Existing chops
                </button>
              </div>
            )}
          </div>
        )}
        {mode === "pattern" && (
          <div
            className="section-navigation"
            role="group"
            aria-label="Sequence chop navigation"
          >
            <button
              className="chop__btn"
              aria-label="Previous chop"
              disabled={!state.slots.length || editIndex === 0}
              onClick={() => navigate(-1)}
            >
              ←
            </button>
            <span>
              {editIndex === null
                ? "Sequence end"
                : `Chop ${editIndex + 1} / ${state.slots.length}`}{" "}
              · {positionText(total, beatsPerBar)}
            </span>
            <button
              className="chop__btn"
              aria-label="Next chop"
              disabled={editIndex === null}
              onClick={() => navigate(1)}
            >
              →
            </button>
          </div>
        )}
        <div className="section-info">
          <span>
            {active
              ? `Source bar ${active.barIndex + 1} · ${positionText(offset, beatsPerBar)}`
              : "No complete steps here"}
          </span>
          <span>
            {(((60 * sampleRate) / beatFrames) * 2 ** (pitch / 12)).toFixed(2)}{" "}
            BPM · {state.slots.length} pieces
          </span>
        </div>
        <div className="section-stage">
          <canvas
            ref={canvas}
            role="application"
            tabIndex={0}
            aria-describedby="section-gesture-help"
            aria-label={
              mode === "source"
                ? "Drag down for later sections, up for earlier. Move horizontally to position; tap to cut."
                : "Browse vertically. Short left confirms; long left inserts silence. Short right trims; long right rewinds to bar start."
            }
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={() => release()}
            onPointerCancel={() => release(true)}
            onLostPointerCapture={() => {
              if (finger.current) release(true);
            }}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (
                [
                  "ArrowUp",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowRight",
                  "Enter",
                  " ",
                ].includes(e.key)
              )
                e.preventDefault();
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                const next = clamp(
                  index + (e.key === "ArrowDown" ? -1 : 1),
                  0,
                  rows.length - 1,
                );
                setSelected(next);
                browse(rows[next]);
              }
              if (mode === "source") {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight")
                  setPoint((p) =>
                    clamp(
                      p + (e.key === "ArrowLeft" ? 1 : -1),
                      0,
                      sectionSteps - 1,
                    ),
                  );
                if (e.key === "Enter" || e.key === " ") cut();
              } else if (e.key === "ArrowLeft" || e.key === "Enter") confirm();
              else if (e.key === "ArrowRight" && last) {
                const prefix = e.shiftKey
                  ? rewindLastBar(priorSlots, beatsPerBar)
                  : trimPrevious(priorSlots, selectionLength);
                change({
                  ...state,
                  slots: [
                    ...prefix,
                    ...(editIndex === null ? [] : state.slots.slice(editIndex)),
                  ],
                });
                setEditAt(null);
              }
            }}
          />
        </div>
        <p
          id="section-gesture-help"
          className={`section-hint ${mode === "pattern" ? "section-hint--hidden" : ""}`}
        >
          {mode === "source"
            ? "Swipe down for later sections. Move sideways to position, then tap to cut. Tempo and bar 1 come from the alignment editor."
            : "Short left: confirm; long left: silence. Short right: trim; long right: bar start. Swipe vertically to browse. Sequence scrolls under the playhead."}
        </p>
        {mode === "pattern" && (
          <div
            className="section-length"
            role="group"
            aria-label="Candidate note length"
          >
            <div className="section-size-adjustments">
              <button
                className="chop__btn section-length__plus"
                aria-label="Shorten candidate"
                disabled={
                  rhythmActive ||
                  (candidate?.steps ?? selectionLength) <= SHORTEST_NOTE
                }
                onClick={() => {
                  audio.stop();
                  const length = Math.max(
                    SHORTEST_NOTE,
                    quantizeNote((candidate?.steps ?? selectionLength) - 1),
                  );
                  setWanted(length);
                  setLibraryLength(length);
                }}
              >
                −
              </button>
              <button
                className="chop__btn section-length__plus"
                aria-label="Lengthen candidate"
                disabled={rhythmActive}
                onClick={() => {
                  audio.stop();
                  const current = candidate?.steps ?? selectionLength;
                  const barSteps = stepsPerBar(beatsPerBar);
                  const end = total + current;
                  const gap =
                    Math.ceil((end + 1e-8) / barSteps) * barSteps - end;
                  const length = quantizeNote(current + Math.min(1, gap));
                  setWanted(length);
                  setLibraryLength(length);
                }}
              >
                +
              </button>
            </div>
            <div className="section-length__notes">
              {lengths.map((note) => {
                const progress = note.id.endsWith("T")
                  ? tripletProgress(state.slots, note.steps)
                  : 0;
                return (
                  <button
                    key={note.id}
                    className={`chop__btn ${progress ? `section-triplet-${progress}` : ""}`}
                    aria-label={note.accessibleLabel}
                    title={
                      progress
                        ? `${note.accessibleLabel}: ${progress === 3 ? "back on straight grid" : `${progress} of 3`}`
                        : note.accessibleLabel
                    }
                    aria-pressed={Math.abs(selectionLength - note.steps) < 1e-8}
                    disabled={rhythmActive}
                    onClick={(e) => {
                      audio.stop();
                      setWanted(note.steps);
                      setLibraryLength(note.steps);
                      lengthView.current = { total, length: note.steps };
                      e.currentTarget.scrollIntoView({
                        block: "nearest",
                        inline: "nearest",
                      });
                    }}
                  >
                    {note.label}
                    {progress > 0 && (
                      <small>{progress === 3 ? "✓" : `${progress}/3`}</small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="section-transport">
          <button
            className="chop__btn"
            disabled={!candidate}
            onPointerDown={hold}
            onPointerUp={audio.stop}
            onPointerCancel={audio.stop}
            onLostPointerCapture={audio.stop}
            onBlur={audio.stop}
            onKeyDown={(e) => {
              if (
                (e.key === " " || e.key === "Enter") &&
                !e.repeat &&
                candidate
              ) {
                e.preventDefault();
                void audio.play(
                  [{ chop: candidate, steps: candidate.steps }],
                  "candidate",
                );
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") audio.stop();
            }}
          >
            Hold to play
          </button>
          <button
            className="chop__btn"
            disabled={!state.slots.length || !candidate || mode === "source"}
            onClick={previewJoin}
          >
            Preview Join
          </button>
          <button
            className="chop__btn"
            disabled={!state.slots.length}
            aria-pressed={audio.position?.kind === "sequence"}
            onClick={() =>
              audio.position
                ? audio.stop()
                : void audio.play(pieces(), "sequence")
            }
          >
            {audio.position ? "Stop" : "Sequence"}
          </button>
        </div>
        <label className="section-volume">
          Volume
          <input
            type="range"
            aria-label="Audition volume"
            min={0}
            max={1}
            step={0.01}
            value={audio.volume}
            onChange={(e) => audio.setVolume(+e.target.value)}
          />
        </label>
        <div className="section-actions">
          <button
            className="chop__btn"
            disabled={!history.past.length || saving}
            onClick={() => {
              audio.stop();
              setHistory((h) => undo(h));
              setEditAt(null);
              setNotice("Previous editing state restored");
            }}
          >
            Undo
          </button>
          <button
            className="chop__btn"
            disabled={!active || saving}
            onClick={mode === "source" ? cut : confirm}
          >
            {mode === "source"
              ? "Place cut"
              : editIndex === null
                ? "Confirm"
                : "Replace chop"}
          </button>
          {mode === "pattern" && (
            <button
              className="chop__btn"
              disabled={saving}
              onClick={addSilence}
            >
              Silence
            </button>
          )}
        </div>
        <div className="section-notice" role="status">
          {notice ||
            `${state.cuts.length} cuts · ${positionText(total, beatsPerBar)} assembled`}
        </div>
        <button
          className="chop__go"
          disabled={!state.slots.length || saving}
          onClick={() => void finish()}
        >
          {saving ? "Checking export…" : "Done · keep pattern"}
        </button>
      </div>
    </div>
  );
}
