import { useEffect, useMemo, useRef, useState } from "react";
import {
  NOTE_VALUES,
  noteLength,
  quantizeNote,
  SHORTEST_NOTE,
  type NoteValue,
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
  addCandidate,
  clamp,
  mod,
  nextOffset,
  slotFades,
  sourceCandidates,
  type WorkspaceResult,
  type WorkspaceState,
} from "../audio/song/sectionWorkspace";
import { baseGrid, startHistory, commit, undo } from "../audio/song/chopMarks";
import { lineFrame, type TapGrid } from "../audio/song/tapGrid";
import { buildPyramid, columnPeaks } from "../audio/song/waveform";
import { useChopAudition, type AuditionPiece } from "./useChopAudition";
import "./SectionWorkspace.css";

interface Props {
  channelData: Float32Array[];
  sampleRate: number;
  beatFrames: number;
  beatsPerBar: number;
  chops: MakerChop[];
  initial: Slot[];
  colors: readonly string[];
  grid?: TapGrid;
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
    startHistory<WorkspaceState>({ chops, slots: initial, cuts: [] }),
  );
  const state = history.present;
  const [mode, setMode] = useState<"source" | "pattern">(
    startInSource ? "source" : "pattern",
  );
  const [library, setLibrary] = useState(false);
  const [libraryLength, setLibraryLength] = useState<number | null>(null);
  const [bars, setBars] = useState(4);
  const [point, setPoint] = useState(0);
  const [noteValue, setNoteValue] = useState<NoteValue>("bar");
  const [triplet, setTriplet] = useState(false);
  const [wanted, setWanted] = useState(stepsPerBar(beatsPerBar));
  const lengthView = useRef({ total: -1, length: 0 });
  const [selected, setSelected] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const sectionSteps = bars * stepsPerBar(beatsPerBar);
  const offset =
    mode === "source" || !state.slots.length
      ? point
      : nextOffset(state, sectionSteps, grid);
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
      mode === "source" ? sectionSteps : wanted,
      phases,
    ).reverse();
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
    wanted,
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
          Math.min(wanted, sectionSteps - point),
          phases,
        ).find(
          (c) =>
            Math.floor(c.barIndex / bars) ===
            Math.floor(active.barIndex / bars),
        )
      : active && libraryLength !== null && library
        ? {
            ...active,
            steps: Math.min(active.steps, libraryLength),
            length: Math.round(
              (active.length * Math.min(active.steps, libraryLength)) /
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
  const total = slotStarts(state.slots).total;
  const last = state.slots.at(-1);
  const trimDistance =
    finger.current?.trimDistance ??
    Math.min(
      ((last?.steps ?? 0) / Math.max(SHORTEST_NOTE, span.current)) *
        (canvas.current?.clientWidth ?? 374) *
        0.55,
      (canvas.current?.clientWidth ?? 374) * 0.55,
    );
  const trim =
    last && dragX > 0
      ? Math.max(
          SHORTEST_NOTE,
          quantizeNote(
            last.steps - (dragX / Math.max(1, trimDistance)) * last.steps,
          ),
        )
      : last?.steps;
  const removeArmed = !!last && dragX > trimDistance + 72;
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
    const join = w * (mode === "source" ? 0.1 : 0.19),
      fit = w - join - 12,
      center = h / 2;
    const target =
      mode === "source"
        ? sectionSteps
        : Math.max(SHORTEST_NOTE, candidate?.steps ?? wanted);
    if (lengthView.current.total !== total) {
      lengthView.current = { total, length: target + 4 };
    }
    const viewSteps = Math.max(lengthView.current.length, target);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finger.current)
      position.current += (index - position.current) * (reduce ? 1 : 0.22);
    span.current += (target - span.current) * (reduce ? 1 : 0.2);
    const shift = Math.min(0, dragX),
      px = fit / (mode === "source" ? span.current : viewSteps);
    const historyPx = fit / stepsPerBar(beatsPerBar);
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
    // History is clipped left of the join. It never shares the candidate's pointer handlers.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, center - 48, join + shift, 96);
    ctx.clip();
    let edge = join + shift;
    for (let i = state.slots.length - 1; i >= 0 && edge > -w; i--) {
      const slot = state.slots[i],
        length =
          i === state.slots.length - 1 ? (trim ?? slot.steps) : slot.steps;
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
          (mode === "source" ? fit : span.current * px) *
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
      const end = total + target;
      const barSteps = stepsPerBar(beatsPerBar);
      const boundary = Math.ceil((end - 1e-8) / barSteps) * barSteps;
      const gap = boundary - end;
      const highlighted = gap > 1e-8 && gap <= 4;
      const marker = highlighted ? boundary : end;
      const x = join + (marker - total) * px;
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
          audio.position.steps * (audio.position.steps < 0 ? historyPx : px);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(clamp(x, 3, w - 3), center + 48, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = muted;
    ctx.fillText("↓ LATER SECTIONS", 12, 22);
    ctx.fillText("↑ EARLIER SECTIONS", 12, h - 18);
    ctx.fillText(
      mode === "source" ? "MOVE TO POSITION · TAP TO CUT" : "← CONFIRM",
      12,
      h - 42,
    );
    if (mode === "pattern") {
      ctx.textAlign = "right";
      ctx.fillStyle = removeArmed ? "#e08079" : muted;
      ctx.fillText(
        removeArmed
          ? "RELEASE TO REMOVE"
          : dragX > 0
            ? `TRIM TO ${trim} STEPS`
            : "TRIM / REMOVE →",
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
          : Math.max(SHORTEST_NOTE, candidate?.steps ?? wanted);
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
    wanted,
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
    change(addCandidate(state, candidate));
    setNotice("Piece confirmed · alternatives follow its endpoint");
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
    } else if (f.axis === "x" && mode === "pattern") {
      if (f.dx < -Math.min(84, (canvas.current?.clientWidth ?? 374) * 0.23))
        confirm();
      else if (f.dx > 10 && last) {
        const slots = state.slots.slice();
        const removed = f.dx > f.trimDistance + 72;
        const shortened = Math.max(
          SHORTEST_NOTE,
          quantizeNote(
            last.steps - (f.dx / Math.max(1, f.trimDistance)) * last.steps,
          ),
        );
        if (removed) slots.pop();
        else slots[slots.length - 1] = { ...last, steps: shortened };
        change({ ...state, slots });
        setNotice(
          removed
            ? "Piece removed · Undo available"
            : "Join moved · alternatives updated",
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
    for (let i = state.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const s = state.slots[i],
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
      await onDone({ chops: state.chops, slots: state.slots, grid });
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
        <div className="chop__head">
          <span>
            {mode === "source" ? "Song sections" : "Chop rearranger"}
            <span className="chop__version">v{__APP_VERSION__}</span>
          </span>
          <button onClick={askClose} aria-label="Close workspace">
            ×
          </button>
        </div>
        <div className="section-tabs" aria-label="Section length">
          {[4, 8, 16].map((n) => (
            <button
              key={n}
              className="chop__btn"
              aria-pressed={bars === n}
              onClick={() => chooseBars(n)}
            >
              {n} bars
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
            }}
          >
            Pattern maker
          </button>
        </div>
        {mode === "pattern" && state.chops.length > 0 && (
          <div className="section-actions">
            <button
              className="chop__btn"
              aria-pressed={!library}
              onClick={() => {
                audio.stop();
                setLibrary(false);
              }}
            >
              Source sections
            </button>
            <button
              className="chop__btn"
              aria-pressed={library}
              onClick={() => {
                audio.stop();
                setLibrary(true);
              }}
            >
              Existing chops
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
            aria-label={
              mode === "source"
                ? "Drag down for later sections, up for earlier. Move horizontally to position; tap to cut."
                : "Browse sections vertically. Drag left to confirm, right to trim then remove."
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
              else if (e.key === "ArrowRight" && last)
                change({
                  ...state,
                  slots:
                    last.steps <= SHORTEST_NOTE
                      ? state.slots.slice(0, -1)
                      : [
                          ...state.slots.slice(0, -1),
                          {
                            ...last,
                            steps: Math.max(
                              SHORTEST_NOTE,
                              quantizeNote(last.steps - 1 / 12),
                            ),
                          },
                        ],
                });
            }}
          />
        </div>
        <p className="section-hint">
          {mode === "source"
            ? "Swipe down for later sections. Move sideways to position, then tap to cut. Tempo and bar 1 come from the alignment editor."
            : "Swipe vertically to browse. Swipe left to confirm; right to shorten, then through resistance to remove. The dot follows audio; the line follows your finger."}
        </p>
        {mode === "pattern" && (
          <div
            className="section-length"
            role="group"
            aria-label="Candidate note length"
          >
            <div className="section-length__notes">
              {NOTE_VALUES.map((note) => {
                const length = noteLength(note.id, triplet, beatsPerBar);
                return (
                  <button
                    key={note.id}
                    className="chop__btn"
                    aria-label={`${note.label}${triplet ? " triplet" : ""}`}
                    aria-pressed={noteValue === note.id}
                    onClick={() => {
                      audio.stop();
                      setNoteValue(note.id);
                      setWanted(length);
                      lengthView.current = { total, length: length + 4 };
                      setLibraryLength(length);
                    }}
                  >
                    {note.label}
                  </button>
                );
              })}
            </div>
            <button
              className="chop__btn section-length__triplet"
              aria-label="Triplet"
              aria-pressed={triplet}
              title="Triplet: three notes in the time of two"
              onClick={() => {
                audio.stop();
                const next = !triplet;
                const length = noteLength(noteValue, next, beatsPerBar);
                setTriplet(next);
                setWanted(length);
                lengthView.current = { total, length: length + 4 };
                setLibraryLength(length);
              }}
            >
              Triplet
            </button>
            <button
              className="chop__btn section-length__plus"
              aria-label="Lengthen candidate"
              onClick={() => {
                audio.stop();
                const current = candidate?.steps ?? wanted;
                const barSteps = stepsPerBar(beatsPerBar);
                const end = total + current;
                const gap = Math.ceil((end + 1e-8) / barSteps) * barSteps - end;
                const length = quantizeNote(current + Math.min(1, gap));
                setWanted(length);
                setLibraryLength(length);
              }}
            >
              +
            </button>
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
            {mode === "source" ? "Place cut" : "Confirm"}
          </button>
          {mode === "pattern" && (
            <button
              className="chop__btn"
              disabled={saving}
              onClick={() =>
                change({
                  ...state,
                  slots: [...state.slots, { kind: "silence", steps: wanted }],
                })
              }
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
