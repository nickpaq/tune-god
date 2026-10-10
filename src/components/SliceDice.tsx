import { useEffect, useMemo, useRef, useState } from "react";
import { isDrag, spanAfterDrag, viewUnderFinger, zoomRate, zoomRoom } from "../audio/song/zoom";
import { getAudioContext } from "../audio/decode";
import { chopColor } from "../audio/palettes";
import { positionText, slotStarts, stepsPerBar, type MakerChop, type Slot } from "../audio/song/patternMaker";
import { slotFades, type WorkspaceResult } from "../audio/song/sectionWorkspace";
import { baseGrid, commit, redo, startHistory, undo, type History } from "../audio/song/chopMarks";
import type { TapGrid } from "../audio/song/tapGrid";
import { buildPyramid, columnPeaks } from "../audio/song/waveform";
import {
  clamp,
  compact,
  copyOver,
  firstStep,
  makePiece,
  mod,
  nearestBar,
  neighbourPiece,
  nextSequential,
  randomize,
  repeatSlot,
  silenceAfter,
  SIZES,
  sizeSteps,
  withPiece,
  type DiceState,
} from "../audio/song/sliceDice";
import { useChopAudition, type AuditionPiece } from "./useChopAudition";
import "./SliceDice.css";

interface Props {
  channelData: Float32Array[];
  sampleRate: number;
  beatFrames: number;
  beatsPerBar: number;
  /** The chops of an arrangement being edited again (none when it is new). */
  chops?: MakerChop[];
  initial?: Slot[];
  colors: readonly string[];
  grid?: TapGrid;
  /** The size of every piece, in steps. Taken from the first slot of an arrangement being edited again, else a quarter note. */
  size?: number;
  /** Where the song's first piece starts, in steps: the anchor, or the beginning of the song. */
  startStep?: number;
  pitch?: number;
  onDone: (result: WorkspaceResult) => void | Promise<void>;
  onClose: () => void;
}

interface Finger {
  id: number;
  x: number;
  y: number;
  moved: boolean;
  pivot: number;
  y0: number;
  span: number;
  trail: { t: number; center: number }[];
}

/** Scrubbing the arrangement feels like the waveform view (ChopTimeline): the same zoom range, ease, momentum and fully-zoomed-in margin. */
const SCRUB_CLOSEST_SECONDS = 0.1;
const SCRUB_RESTING_SECONDS = 12;
const SCRUB_ZOOM_EASE_PX = 40;
const SCRUB_COAST_TAU_MS = 260;
const SCRUB_COAST_STALE_MS = 70;
const SCRUB_CLOSEST_MARGIN = 1.08;
const GLIDE_MS = 150;

/**
 * Slice and dice: the song cut into pieces of one size, laid out one after another under a fixed playhead. The arrow keys move between the
 * chops of the arrangement, the up and down keys give the chop under the playhead the next or previous piece of the song, and the rest paste
 * pieces in. Dragging scrubs and zooms the arrangement exactly as the waveform view does.
 */
export function SliceDice({ channelData, sampleRate, beatFrames, beatsPerBar, chops = [], initial = [], colors, grid: suppliedGrid, size: suppliedSize, startStep, pitch = 0, onDone, onClose }: Props) {
  const totalFrames = channelData[0].length;
  const grid = useMemo(() => suppliedGrid ?? baseGrid(sampleRate, beatsPerBar, (60 * sampleRate) / beatFrames, 0), [suppliedGrid, sampleRate, beatsPerBar, beatFrames]);
  const phases = useMemo(() => [0, 1, 2, 3].map((i) => chopColor(colors, i)), [colors]);
  const bar = stepsPerBar(beatsPerBar);
  const origin = startStep ?? firstStep(grid);
  const size = suppliedSize ?? initial.find((s) => s.kind === "chop")?.steps ?? 4;
  const sizeLabel = SIZES.find((_, i) => Math.abs(sizeSteps(i, beatsPerBar) - size) < 1e-6)?.label;

  const [history, setHistory] = useState<History<DiceState>>(() => {
    if (initial.length) return startHistory<DiceState>({ chops, slots: initial });
    const first = makePiece(grid, totalFrames, colors, origin, size);
    return startHistory<DiceState>(first ? withPiece({ chops: [], slots: [] }, first) : { chops: [], slots: [] });
  });
  const state = history.present;
  const { starts, total } = slotStarts(state.slots);
  const [sel, setSel] = useState(0);
  const here = clamp(sel, 0, Math.max(0, state.slots.length - 1));
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  /** Play (from the chop before the selected one to the end) or Sequence (from the beginning), while engaged. */
  const [mode, setMode] = useState<"play" | "sequence" | null>(null);
  /** Repeat sequence: the square from a bar to the playhead, and how many steps it is copied over. */
  const [rep, setRep] = useState<{ from: number; count: number } | null>(null);

  const audio = useChopAudition(channelData, sampleRate, beatFrames, pitch);
  const pyramid = useMemo(() => buildPyramid(channelData), [channelData]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const finger = useRef<Finger | null>(null);
  const glideFrame = useRef(0);
  const lastBrowse = useRef({ stamp: "", at: 0 });
  /** The step under the playhead, how many steps the screen shows, and the chop last sounded. */
  const arrangement = useRef({ center: 0, span: (SCRUB_RESTING_SECONDS * sampleRate * 4) / beatFrames, slot: 0, sounded: -1 });
  /** The chop the last swap changed: swaps in a row on one chop are one step of Undo. */
  const lastSwap = useRef<number | null>(null);
  const live = useRef({ state, starts, total, mode, rep, sel: here });
  live.current = { state, starts, total, mode, rep, sel: here };
  useEffect(() => () => cancelAnimationFrame(glideFrame.current), []);

  const slotAt = (step: number, list = starts): number => {
    let lo = 0,
      hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (list[mid] <= step) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(0, lo);
  };
  const zoomLimits = () => {
    const stepSeconds = beatFrames / 4 / sampleRate;
    const farthest = Math.max(live.current.total, 2 * bar);
    return { farthest, closest: Math.min(farthest, SCRUB_CLOSEST_SECONDS / stepSeconds), resting: Math.min(farthest, SCRUB_RESTING_SECONDS / stepSeconds) };
  };

  // ---- sound ----

  /** Sounds one slot (silence stops the sound). Scrubbing is throttled; a tap, a let-go or a button passes `force`. */
  const auditionSlot = (i: number, st = live.current.state, force = false) => {
    const slot = st.slots[i];
    if (!slot) return;
    arrangement.current.sounded = i;
    if (slot.kind !== "chop") return audio.stop();
    const chop = st.chops[slot.chop];
    const stamp = `${i}:${chop.start}:${slot.steps}`,
      now = performance.now();
    if (!force && (stamp === lastBrowse.current.stamp || now - lastBrowse.current.at < 85)) {
      arrangement.current.sounded = -1;
      return;
    }
    lastBrowse.current = { stamp, at: now };
    void audio.play([{ ...slotFades(st.slots, i), chop, steps: slot.steps }], "browse");
  };
  /** The arrangement from step `from` to its end, as pieces (the slot `from` falls inside plays from there). */
  const piecesFrom = (st: DiceState, from: number): { pieces: AuditionPiece[]; at: number } => {
    const { starts: s } = slotStarts(st.slots);
    const pieces: AuditionPiece[] = [];
    st.slots.forEach((slot, i) => {
      if (s[i] + slot.steps <= from + 1e-9) return;
      const skip = Math.max(0, from - s[i]);
      pieces.push({ ...slotFades(st.slots, i), chop: slot.kind === "chop" ? st.chops[slot.chop] : undefined, steps: slot.steps - skip, skip });
    });
    return { pieces, at: from };
  };
  const startFrom = (st: DiceState, from: number) => {
    const { pieces, at } = piecesFrom(st, from);
    if (pieces.length) void audio.play(pieces, "sequence", at);
    else audio.stop();
  };
  /** What the engaged Play or Sequence does after the arrangement or the selection moved: from the chop before the selected one (Play) or from the selected one (Sequence). */
  const resumeFor = (st: DiceState, i: number, how: "play" | "sequence") => {
    const s = slotStarts(st.slots).starts;
    startFrom(st, how === "play" ? (s[Math.max(0, i - 1)] ?? 0) : (s[i] ?? 0));
  };
  /** Sounds what a move to chop `i` should sound: the engaged play, or the chop alone. */
  const soundAt = (i: number, st = live.current.state) => {
    const how = live.current.mode;
    if (how) resumeFor(st, i, how);
    else auditionSlot(i, st, true);
  };

  // ---- the view ----

  /** Makes the chop under the playhead the selected one, sounding it as the playhead crosses into it (not while a play is going or being scrubbed). */
  const crossSlots = () => {
    const a = arrangement.current;
    const at = slotAt(a.center);
    if (at === a.slot) return;
    a.slot = at;
    setSel(at);
    if (!live.current.mode) auditionSlot(at);
  };
  useEffect(() => {
    const a = arrangement.current;
    if (!state.slots.length) return;
    if (!finger.current && a.slot !== here) {
      a.slot = here;
      a.center = starts[here];
    }
    a.center = clamp(a.center, 0, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.slots.length, here]);
  useEffect(() => {
    const p = audio.position;
    if (p?.kind !== "sequence") return;
    const a = arrangement.current;
    a.center = clamp(p.steps, 0, total);
    const at = slotAt(a.center);
    a.slot = at;
    if (at !== live.current.sel) setSel(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.position]);
  useEffect(() => {
    if (audio.ended) setMode(null);
  }, [audio.ended]);

  /** The end of the Repeat sequence square: the bar nearest the playhead, at least a bar after its start. */
  const repEnd = (r: { from: number }) => clamp(nearestBar(arrangement.current.center, beatsPerBar), Math.min(r.from + bar, live.current.total), live.current.total);

  const [sizeVersion, setSizeVersion] = useState(0);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSizeVersion((v) => v + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const paint = useRef<() => void>(() => {});
  paint.current = () => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const w = el.clientWidth,
      h = el.clientHeight,
      ratio = Math.min(3, window.devicePixelRatio || 1);
    if (el.width !== Math.round(w * ratio) || el.height !== Math.round(h * ratio)) {
      el.width = Math.round(w * ratio);
      el.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const css = getComputedStyle(el),
      ink = css.color,
      muted = getComputedStyle(el.parentElement!).getPropertyValue("--ink3").trim() || "#92999d",
      accent = css.getPropertyValue("--accent").trim() || "#ff7a1a";
    ctx.clearRect(0, 0, w, h);
    const center = h / 2,
      band = Math.min(88, h * 0.5);
    const a = arrangement.current;
    a.span = Math.min(a.span, zoomLimits().farthest);
    const perStep = w / a.span,
      stepX = (step: number) => w / 2 + (step - a.center) * perStep;
    const wave = (c: MakerChop | null, x: number, width: number, alpha: number, steps: number) => {
      if (width <= 0) return;
      ctx.save();
      ctx.fillStyle = c ? phases[mod(c.barIndex, 4)] : muted;
      ctx.globalAlpha = alpha * 0.16;
      ctx.fillRect(x, center - band / 2, width, band);
      ctx.globalAlpha = alpha;
      if (c) {
        const columns = Math.max(1, Math.ceil(width / 2)),
          lo = new Float32Array(columns),
          hi = new Float32Array(columns);
        columnPeaks(pyramid, c.start, (c.length * steps) / c.steps, columns, lo, hi);
        for (let j = 0; j < columns; j++) {
          ctx.fillStyle = phases[mod(Math.floor((c.barIndex * bar + (j / columns) * steps) / bar), 4)];
          const peak = Math.min(1, Math.max(-lo[j], hi[j]) / Math.max(0.001, pyramid.peak));
          ctx.fillRect(x + (j / columns) * width, center - peak * band * 0.43, Math.max(1, (width / columns) * 0.7), Math.max(1, peak * band * 0.86));
        }
      }
      ctx.restore();
    };
    ctx.font = "11px Barlow Semi Condensed, sans-serif";
    const at = slotAt(a.center);
    starts.forEach((start, i) => {
      const slot = state.slots[i],
        x = stepX(start),
        width = slot.steps * perStep;
      if (x + width < 0 || x > w) return;
      wave(slot.kind === "chop" ? state.chops[slot.chop] : null, x, Math.max(1, width - 1), i === at ? 0.95 : 0.5, slot.steps);
      if (i === at) {
        ctx.strokeStyle = ink;
        ctx.globalAlpha = 0.8;
        ctx.strokeRect(x + 0.5, center - band / 2 - 0.5, Math.max(1, width - 2), band + 1);
        ctx.globalAlpha = 1;
      }
    });
    const unit = [1, 2, 4, bar, bar * 4].find((u) => u * perStep >= 7) ?? bar * 16;
    ctx.fillStyle = muted;
    for (let step = Math.floor((a.center - a.span / 2) / unit) * unit; step <= a.center + a.span / 2; step += unit) {
      if (step < 0 || step > total) continue;
      const barLine = step % bar === 0;
      ctx.globalAlpha = barLine ? 0.85 : step % 4 === 0 ? 0.5 : 0.3;
      const line = h * (barLine ? 0.72 : step % 4 === 0 ? 0.5 : 0.25);
      ctx.fillRect(stepX(step), center - line / 2, barLine ? 2 : 1, line);
      if (barLine && bar * perStep >= 40) ctx.fillText(`BAR ${step / bar + 1}`, stepX(step) + 3, center - h * 0.38);
    }
    ctx.globalAlpha = 1;
    const r = live.current.rep;
    if (r) {
      const to = repEnd(r),
        x0 = stepX(r.from),
        x1 = stepX(to),
        x2 = stepX(to + r.count);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(x0, 2, x1 - x0, h - 4);
      ctx.globalAlpha = 0.1;
      ctx.fillRect(x1, 2, x2 - x1, h - 4);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, 3, Math.max(1, x1 - x0 - 2), h - 6);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x1 + 0.5, 3.5, Math.max(1, x2 - x1 - 1), h - 7);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = ink;
    ctx.fillRect(w / 2 - 1, center - h * 0.4, 2, h * 0.8);
  };
  useEffect(() => {
    const raf = requestAnimationFrame(() => paint.current());
    return () => cancelAnimationFrame(raf);
  }, [state, here, rep, audio.position, phases, sizeVersion, total]);

  // ---- moving between chops ----

  /** Slides the playhead to a step, then `done`. */
  const glide = (to: number, done: () => void) => {
    cancelAnimationFrame(glideFrame.current);
    const a = arrangement.current,
      from = a.center,
      t0 = performance.now();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = (t: number) => {
      const k = reduce ? 1 : Math.min(1, (t - t0) / GLIDE_MS);
      a.center = from + (to - from) * (1 - (1 - k) ** 3);
      paint.current();
      if (k < 1) glideFrame.current = requestAnimationFrame(frame);
      else done();
    };
    glideFrame.current = requestAnimationFrame(frame);
  };
  /** Moves the playhead to the beginning of the neighbouring chop and sounds it. Nothing happens past either end. */
  const go = (direction: -1 | 1) => {
    const next = here + direction;
    if (next < 0 || next >= state.slots.length) return;
    audio.stop();
    lastSwap.current = null;
    arrangement.current.slot = next;
    setSel(next);
    glide(starts[next], () => soundAt(next));
    setNotice(`Chop ${next + 1} of ${state.slots.length}`);
  };

  /** Applies an edit as one step of Undo (a swap on the chop the last swap changed joins that step). */
  const change = (next: DiceState, swapOf: number | null = null) => {
    const join = swapOf !== null && lastSwap.current === swapOf;
    lastSwap.current = swapOf;
    setHistory((h) => (join ? { ...h, present: next } : commit(h, next)));
  };
  const select = (i: number, st: DiceState) => {
    const s = slotStarts(st.slots).starts;
    arrangement.current.slot = i;
    arrangement.current.center = s[i] ?? 0;
    setSel(i);
  };

  /** ▲ gives the chop under the playhead the next piece of the song, ▼ the previous one; its length and place stay. */
  const swap = (direction: 1 | -1) => {
    const slot = state.slots[here];
    if (!slot || rep) return;
    if (slot.kind !== "chop") return setNotice("Silence has no piece of the song to swap");
    const piece = neighbourPiece(grid, totalFrames, phases, state, slot, direction);
    if (!piece) return setNotice(direction > 0 ? "That is the last piece of the song" : "That is the first piece of the song");
    const next = withPiece(state, piece, here, "replace");
    change(next, here);
    soundAt(here, next);
    setNotice(`Chop ${here + 1} now from bar ${piece.barIndex + 1}`);
  };
  const pasteNext = () => {
    const piece = nextSequential(grid, totalFrames, phases, state, here, size, origin);
    if (!piece) return setNotice("There is no more of the song to paste");
    const next = withPiece(state, piece, here + 1, "insert");
    change(next);
    select(here + 1, next);
    soundAt(here + 1, next);
    setNotice(`Next chop of the song pasted after chop ${here + 1}`);
  };
  const repeatChop = () => {
    if (!state.slots[here]) return;
    const next = repeatSlot(state, here);
    change(next);
    select(here + 1, next);
    soundAt(here + 1, next);
    setNotice(`Chop ${here + 1} repeated`);
  };
  const addSilence = () => {
    const next = silenceAfter(state, state.slots.length ? here : -1, size);
    change(next);
    select(state.slots.length ? here + 1 : 0, next);
    audio.stop();
    setNotice("Silence pasted");
  };
  const shuffle = () => {
    if (!state.slots.some((s) => s.kind === "chop")) return;
    const next = randomize(grid, totalFrames, phases, state, origin);
    change(next);
    soundAt(here, next);
    setNotice("Every chop swapped for a random piece of the song, kept on its beat of the bar");
  };

  const restoreHistory = (forward: boolean) => {
    audio.stop();
    lastSwap.current = null;
    const restored = forward ? redo(history) : undo(history);
    setHistory(restored);
    const i = clamp(sel, 0, Math.max(0, restored.present.slots.length - 1));
    select(i, restored.present);
    setRep(null);
    setNotice(forward ? "Redone" : "Undone");
  };

  // ---- playing ----

  const togglePlay = () => {
    if (mode === "play") {
      setMode(null);
      return audio.stop();
    }
    setMode("play");
    live.current.mode = "play";
    resumeFor(state, here, "play");
  };
  const playSequence = () => {
    if (mode === "sequence") {
      setMode(null);
      return audio.stop();
    }
    setMode("sequence");
    live.current.mode = "sequence";
    startFrom(state, 0);
  };

  // ---- repeat sequence ----

  const startRep = () => {
    if (rep) return setRep(null);
    if (!total) return;
    const last = Math.max(0, Math.ceil(total / bar - 1e-9) * bar - bar);
    const from = Math.min(nearestBar(arrangement.current.center, beatsPerBar), last);
    audio.stop();
    setMode(null);
    setRep({ from, count: Math.min(bar, total - from) || bar });
    setNotice("Scrub to drag the square's end away from its bar, then Copy");
  };
  const copyRep = () => {
    if (!rep) return;
    const to = repEnd(rep);
    const next = copyOver(grid, totalFrames, phases, state, rep.from, to, rep.count);
    change(next);
    setRep(null);
    select(slotAt(rep.from, slotStarts(next.slots).starts), next);
    audio.stop();
    setNotice(`Copied ${positionText(rep.from, beatsPerBar)}–${positionText(to, beatsPerBar)} over the next ${rep.count / bar} bars · Undo available`);
  };

  // ---- fingers ----

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (saving || (e.pointerType === "mouse" && e.button !== 0)) return;
    cancelAnimationFrame(glideFrame.current);
    void getAudioContext().resume();
    e.currentTarget.setPointerCapture(e.pointerId);
    // Scrubbing stops a play for the moment; letting go starts it again from the nearest bar.
    if (live.current.mode) audio.stop();
    finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, pivot: 0, y0: 0, span: arrangement.current.span, trail: [] };
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const f = finger.current;
    if (!f || f.id !== e.pointerId) return;
    const dx = e.clientX - f.x,
      dy = e.clientY - f.y,
      a = arrangement.current,
      rect = e.currentTarget.getBoundingClientRect();
    const across = (x: number) => clamp((x - rect.left) / rect.width, 0, 1);
    if (!f.moved) {
      if (!isDrag(dx, dy)) return;
      f.moved = true;
      // Pin what is under the finger now, so the view does not jump by the distance the tap threshold swallowed.
      f.span = a.span;
      f.y0 = e.clientY;
      f.pivot = a.center - a.span / 2 + across(e.clientX) * a.span;
    }
    // Sideways pulls the arrangement along with the finger; down zooms in, up zooms out (eased in), as in the waveform view.
    const drop = e.clientY - f.y0;
    const eased = drop > 0 ? (drop * drop) / (drop + SCRUB_ZOOM_EASE_PX) : drop;
    const { farthest, closest, resting } = zoomLimits();
    const rate = zoomRate(Math.max(f.span, resting), zoomRoom(rect.bottom, window.innerHeight), closest);
    const wide = spanAfterDrag(f.span, eased, rate, farthest, closest);
    a.span = wide;
    a.center = clamp(viewUnderFinger(f.pivot, across(e.clientX), wide) + wide / 2, 0, live.current.total);
    const now = performance.now();
    f.trail = [...f.trail.filter((q) => now - q.t < 100), { t: now, center: a.center }];
    crossSlots();
    paint.current();
  };
  /** After a scrub with a play engaged: starts again from the bar nearest the playhead. */
  const resumeNearestBar = () => {
    const how = live.current.mode;
    if (!how) return;
    const from = clamp(nearestBar(arrangement.current.center, beatsPerBar), 0, Math.max(0, live.current.total - 1e-6));
    arrangement.current.center = from;
    startFrom(live.current.state, from);
    paint.current();
  };
  const release = (cancel = false) => {
    const f = finger.current;
    finger.current = null;
    if (!f) return;
    const a = arrangement.current;
    if (cancel) {
      audio.stop();
      return;
    }
    if (!f.moved) {
      if (live.current.mode) return resumeNearestBar();
      return auditionSlot(slotAt(a.center), live.current.state, true);
    }
    // Momentum as in the waveform view: carry on at the speed the arrangement was moving, slowing to a stop. Fully zoomed in the line stays put.
    const { closest } = zoomLimits();
    const settle = () => {
      if (live.current.mode) return resumeNearestBar();
      if (a.sounded !== a.slot) auditionSlot(a.slot, live.current.state, true);
    };
    const now = performance.now();
    const first = f.trail[0],
      end = f.trail[f.trail.length - 1];
    if (a.span <= closest * SCRUB_CLOSEST_MARGIN || !first || !end || end === first || now - end.t > SCRUB_COAST_STALE_MS) return settle();
    let v = (end.center - first.center) / (end.t - first.t);
    let prev = now;
    const coast = (t: number) => {
      const dt = Math.min(50, t - prev);
      prev = t;
      const before = a.center;
      a.center = clamp(before + v * dt, 0, live.current.total);
      v *= Math.exp(-dt / SCRUB_COAST_TAU_MS);
      crossSlots();
      paint.current();
      const atEdge = a.center === before && v !== 0;
      if ((Math.abs(v) * (canvas.current?.clientWidth ?? 1)) / a.span < 0.02 || atEdge) return settle();
      glideFrame.current = requestAnimationFrame(coast);
    };
    glideFrame.current = requestAnimationFrame(coast);
  };
  useEffect(() => {
    const cancel = () => (finger.current = null);
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);

  const askClose = () => {
    audio.stop();
    if (!history.past.length || window.confirm("Close the chop rearranger and discard its unsaved edits?")) onClose();
  };
  const finish = async () => {
    if (!state.slots.length || saving) return;
    audio.stop();
    setSaving(true);
    try {
      const kept = compact(state);
      await onDone({ chops: kept.chops, slots: kept.slots, grid });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The pattern could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const slot = state.slots[here];
  const source = slot?.kind === "chop" ? state.chops[slot.chop] : null;
  const none = !state.slots.length;
  return (
    <div className="palette-backdrop chop-backdrop slice" onClick={askClose}>
      <div className="chop" role="dialog" aria-modal="true" aria-label="Chop rearranger" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>
            Chop rearranger<span className="chop__version">v{__APP_VERSION__}</span>
          </span>
          <button onClick={askClose} aria-label="Close">
            X
          </button>
        </div>
        <div className="chop__scroll">
          <div className="chop__screen">
            <canvas
              ref={canvas}
              className="chop-timeline__canvas"
              role="application"
              tabIndex={0}
              aria-label="The arrangement. Drag sideways to scrub; drag down to zoom in and up to zoom out. The chop under the line sounds as it is crossed."
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => release()}
              onPointerCancel={() => release(true)}
              onLostPointerCapture={() => {
                if (finger.current) release(true);
              }}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
                e.preventDefault();
                if (e.key === "ArrowUp") swap(1);
                else if (e.key === "ArrowDown") swap(-1);
                else go(e.key === "ArrowLeft" ? -1 : 1);
              }}
            />
            <div className="chop__readout">
              <span>{sizeLabel ?? `${size / 4} beat`}</span>
              <span>{source ? `Bar ${source.barIndex + 1}` : slot ? "Silence" : "Empty"}</span>
            </div>
          </div>
          <div className="slice__nav" role="group" aria-label="Move between chops">
            <button className="chop__btn" aria-label="Previous chop" disabled={none || here === 0} onClick={() => go(-1)}>
              ←
            </button>
            <span>{none ? "No chops" : `Chop ${here + 1} / ${state.slots.length} · ${positionText(starts[here], beatsPerBar)}`}</span>
            <button className="chop__btn" aria-label="Next chop" disabled={none || here >= state.slots.length - 1} onClick={() => go(1)}>
              →
            </button>
          </div>
          <div className="slice__row">
            <button className="chop__btn" aria-label="Next piece of the song: swap this chop for the one later in the song" disabled={!source || !!rep} onClick={() => swap(1)}>
              ▲
            </button>
            <button className="chop__btn" aria-label="Previous piece of the song: swap this chop for the one earlier in the song" disabled={!source || !!rep} onClick={() => swap(-1)}>
              ▼
            </button>
          </div>
          <div className="slice__row">
            <button className="chop__btn" aria-pressed={mode === "play"} disabled={none} onClick={togglePlay} title="Plays from the chop before this one into this chop, and on to the end. Scrubbing pauses it; it carries on from the nearest bar.">
              Play
            </button>
            <button className="chop__btn" aria-pressed={mode === "sequence"} disabled={none} onClick={playSequence} title="Plays the whole arrangement from the beginning">
              Sequence
            </button>
          </div>
          <div className="slice__row">
            <button className="chop__btn" disabled={!history.past.length || saving} onClick={() => restoreHistory(false)}>
              Undo
            </button>
            <button className="chop__btn" disabled={!history.future.length || saving} onClick={() => restoreHistory(true)}>
              Redo
            </button>
            <button className="chop__btn" disabled={none || !!rep || saving} onClick={shuffle} title="Swaps every chop for a random piece of the song, on the same beat of the bar">
              Randomize
            </button>
          </div>
          <div className="slice__row">
            <button className="chop__btn" disabled={none || !!rep || saving} onClick={pasteNext} title="Pastes the next chop of the song after this one">
              Next chop
            </button>
            <button className="chop__btn" disabled={none || !!rep || saving} onClick={repeatChop} title="Pastes a copy of this chop after it">
              Repeat
            </button>
            <button className="chop__btn" disabled={!!rep || saving} onClick={addSilence} title="Pastes a silence after this chop">
              Silence
            </button>
          </div>
          <div className="slice__row">
            <button className="chop__btn" aria-pressed={!!rep} disabled={none || saving} onClick={startRep} title="Marks a square from the nearest bar to the playhead; Copy repeats it over the next bars">
              {rep ? "Cancel repeat" : "Repeat sequence"}
            </button>
            {rep && (
              <>
                <button className="chop__btn slice__step" aria-label="One bar fewer" disabled={rep.count <= bar} onClick={() => setRep({ ...rep, count: rep.count - bar })}>
                  −
                </button>
                <span className="slice__bars">{rep.count / bar} {rep.count / bar === 1 ? "bar" : "bars"}</span>
                <button className="chop__btn slice__step" aria-label="One bar more" onClick={() => setRep({ ...rep, count: rep.count + bar })}>
                  +
                </button>
                <button className="chop__btn" onClick={copyRep}>
                  Copy
                </button>
              </>
            )}
          </div>
          <div className="slice__notice" role="status">
            {notice || `${state.slots.length} ${state.slots.length === 1 ? "chop" : "chops"} · ${positionText(total, beatsPerBar)}`}
          </div>
        </div>
        <button className="chop__go" disabled={none || saving} onClick={() => void finish()}>
          {saving ? "Checking export…" : "Done · keep pattern"}
        </button>
      </div>
    </div>
  );
}
