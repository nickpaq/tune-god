import { useEffect, useMemo, useRef, useState } from "react";
import { buildPyramid, columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import {
  chopEighths,
  defaultSilence,
  dragLength,
  maxSilence,
  MIN_EIGHTHS,
  orderChops,
  positionText,
  setSlot,
  slotStarts,
  type MakerChop,
  type Slot,
} from "../audio/song/patternMaker";

/** Columns of waveform kept for each chop. */
const COLUMNS = 720;
/** How many bars the silence row spans across its width. */
const SILENCE_SPAN_BARS = 4;
/** A finger that moves this far (CSS pixels) is dragging, not tapping. */
const DRAG_PX = 8;
/** Rows this far from the centred one (or less) draw their waveform. */
const DRAW_NEAR = 4;

type RowKey = number | "s";

const barsText = (eighths: number, beatsPerBar: number) => {
  const bars = eighths / (beatsPerBar * 2);
  return `${+bars.toFixed(2)} bar${bars === 1 ? "" : "s"}`;
};

/** One chop's row: its waveform in its colour, the eighth, beat and bar lines over it, and the part that will play lit (the rest dimmed). */
function RowCanvas({ peaks, color, eighths, len, beatsPerBar }: { peaks: { min: Float32Array; max: Float32Array; scale: number } | null; color: string; eighths: number; len: number; beatsPerBar: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    const playedX = (len / eighths) * w;
    for (let e = 0; e <= eighths; e++) {
      const x = Math.round((e / eighths) * (w - 1));
      const bar = e % (beatsPerBar * 2) === 0;
      const beat = e % 2 === 0;
      ctx.fillStyle = bar ? "rgba(255,255,255,0.45)" : beat ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x, 0, bar ? 2 : 1, h);
    }
    if (peaks) {
      const mid = h / 2;
      for (let c = 0; c < COLUMNS; c++) {
        const x = (c / COLUMNS) * w;
        const top = mid - peaks.max[c] * peaks.scale * mid * 0.92;
        const bottom = mid - peaks.min[c] * peaks.scale * mid * 0.92;
        ctx.globalAlpha = x <= playedX ? 1 : 0.22;
        ctx.fillStyle = color;
        ctx.fillRect(x, top, Math.max(1, w / COLUMNS), Math.max(1, bottom - top));
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(0, 0, playedX, h);
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(Math.min(w - 2, playedX), 0, 2, h);
  }, [peaks, color, eighths, len, beatsPerBar]);
  return <canvas ref={ref} className="maker__canvas" width={COLUMNS} height={200} />;
}

/**
 * The pattern maker (chopper mode, "Finish and open pattern maker"): the chops stacked in a scrolling list, the one nearest the playhead's place in the
 * bar at the bottom. A tap puts the centred chop at the playhead (and the playhead moves to its end); dragging along a row sets how many eighth notes of it
 * play, and dragging back past nothing cuts the chop before it short. The arrows select a slot to change; Done hands the sequence back.
 */
export function PatternMaker({
  channelData,
  chops,
  beatsPerBar,
  initial,
  onDone,
  onClose,
}: {
  channelData: Float32Array[];
  chops: MakerChop[];
  beatsPerBar: number;
  initial: Slot[];
  onDone: (slots: Slot[]) => void;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  /** The selected slot: one of the slots, or `slots.length` for the open place after the last. */
  const [sel, setSel] = useState(initial.length);
  /** Lengths the finger set on rows, by row, until the choice is made. */
  const [lens, setLens] = useState<Record<string, number>>({});
  /** Eighths the drag has cut off the slot before the selected one, not yet let go. */
  const [trim, setTrim] = useState(0);
  const [centered, setCentered] = useState(0);

  const pyramid = useMemo<PeakPyramid>(() => buildPyramid(channelData), [channelData]);
  const peakCache = useRef(new Map<number, { min: Float32Array; max: Float32Array; scale: number }>());
  const peaksOf = (i: number) => {
    let hit = peakCache.current.get(i);
    if (!hit) {
      const min = new Float32Array(COLUMNS);
      const max = new Float32Array(COLUMNS);
      columnPeaks(pyramid, chops[i].start, chops[i].length, COLUMNS, min, max);
      let peak = 0;
      for (let c = 0; c < COLUMNS; c++) peak = Math.max(peak, -min[c], max[c]);
      hit = { min, max, scale: peak > 0 ? 1 / peak : 1 };
      peakCache.current.set(i, hit);
    }
    return hit;
  };

  const { starts, total } = slotStarts(slots);
  const playhead = sel < slots.length ? starts[sel] : total;
  /** The rows from the top down: the last chop of the order first, the silence last (just below the bottommost chop). */
  const rows = useMemo<RowKey[]>(() => [...orderChops(chops, playhead, beatsPerBar).reverse(), "s"], [chops, playhead, beatsPerBar]);

  const fullOf = (key: RowKey) => (key === "s" ? defaultSilence(beatsPerBar) : chopEighths(chops[key], beatsPerBar));
  const spanOf = (key: RowKey) => (key === "s" ? SILENCE_SPAN_BARS * beatsPerBar * 2 : chopEighths(chops[key], beatsPerBar));
  const maxOf = (key: RowKey) => (key === "s" ? maxSilence(beatsPerBar) : chopEighths(chops[key], beatsPerBar));
  /** What a row would play now: what the finger set, else the selected slot's own length when it holds this chop, else the whole chop (a bar of silence). */
  const lenOf = (key: RowKey) => {
    const set = lens[String(key)];
    if (set !== undefined) return set;
    const slot = sel < slots.length ? slots[sel] : undefined;
    if (slot && (key === "s" ? slot.kind === "silence" : slot.kind === "chop" && slot.chop === key)) return slot.eighths;
    return fullOf(key);
  };

  // ---- scrolling ----
  const picker = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState(0);
  const rowHeight = () => picker.current?.querySelector<HTMLElement>(".maker__row")?.offsetHeight ?? 1;
  useEffect(() => {
    const el = picker.current;
    if (!el) return;
    const measure = () => setEdge(Math.max(0, (el.clientHeight - rowHeight()) / 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /** The row the selected slot belongs on: its chop's, the silence's, or for the open place the bottommost chop. */
  const targetRow = useMemo(() => {
    const slot = sel < slots.length ? slots[sel] : undefined;
    if (slot?.kind === "silence") return rows.length - 1;
    if (slot) return rows.indexOf(slot.chop);
    return Math.max(0, rows.length - 2);
  }, [rows, sel, slots]);
  const first = useRef(true);
  useEffect(() => {
    const el = picker.current;
    if (!el || edge === 0 && first.current) return;
    el.scrollTo({ top: targetRow * rowHeight(), behavior: first.current ? "auto" : "smooth" });
    first.current = false;
    // follows the selection and the order, not every length change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRow, sel, edge]);
  const onScroll = () => {
    const el = picker.current;
    if (el) setCentered(Math.max(0, Math.min(rows.length - 1, Math.round(el.scrollTop / rowHeight()))));
  };

  // ---- the finger on a row ----
  const touch = useRef<{ key: RowKey; x: number; y: number; width: number; startLen: number; dragging: boolean } | null>(null);
  const select = (to: number, count = slots.length) => {
    setSel(Math.max(0, Math.min(count, to)));
    setLens({});
    setTrim(0);
  };
  const confirm = (key: RowKey) => {
    const eighths = lenOf(key);
    if (eighths < MIN_EIGHTHS) return;
    const slot: Slot = key === "s" ? { kind: "silence", eighths } : { kind: "chop", chop: key, eighths };
    const next = setSlot(slots, sel, slot);
    setSlots(next);
    select(sel + 1, next.length);
  };
  const down = (key: RowKey) => (e: React.PointerEvent<HTMLDivElement>) => {
    touch.current = { key, x: e.clientX, y: e.clientY, width: e.currentTarget.clientWidth, startLen: lenOf(key), dragging: false };
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.clientX - t.x;
    if (!t.dragging) {
      if (Math.abs(dx) < DRAG_PX || Math.abs(dx) < Math.abs(e.clientY - t.y)) return;
      t.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const { eighths, trim: cut } = dragLength(t.startLen + Math.round((dx / t.width) * spanOf(t.key)), maxOf(t.key));
    const room = sel > 0 ? slots[sel - 1].eighths - MIN_EIGHTHS : 0;
    setLens((l) => ({ ...l, [String(t.key)]: eighths }));
    setTrim(Math.min(cut, room));
  };
  const up = () => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    if (!t.dragging) return confirm(t.key);
    // Dragged back past nothing: the slot before is cut short and the playhead is back at its end, selected, to be dragged out again.
    if (trim > 0 && sel > 0) {
      const before = slots[sel - 1];
      setSlots(setSlot(slots, sel - 1, { ...before, eighths: before.eighths - trim }));
      setSel(sel - 1);
      setLens({});
    }
    setTrim(0);
  };
  const cancel = () => {
    touch.current = null;
    setTrim(0);
  };

  const remove = () => {
    if (sel >= slots.length) return;
    setSlots(slots.filter((_, i) => i !== sel));
    setLens({});
  };

  // ---- the sequence strip ----
  const shown = trim > 0 && sel > 0 ? setSlot(slots, sel - 1, { ...slots[sel - 1], eighths: slots[sel - 1].eighths - trim }) : slots;
  const shownStarts = slotStarts(shown);
  const stripSpan = Math.max(beatsPerBar * 2 * 8, shownStarts.total + beatsPerBar * 2 * 2);
  const at = sel < shown.length ? shownStarts.starts[sel] : shownStarts.total;
  const stripColor = (s: Slot) => (s.kind === "chop" ? chops[s.chop].color : "transparent");

  const askClose = () => {
    if (slots.length === 0 || window.confirm("Close the pattern maker? The chopper keeps one pattern per chop, in order.")) onClose();
  };

  return (
    <div className="palette-backdrop chop-backdrop" onClick={askClose}>
      <div className="chop maker" role="dialog" aria-label="Pattern maker" onClick={(e) => e.stopPropagation()}>
        <div className="chop__head">
          <span>Pattern maker</span>
          <button onClick={askClose} aria-label="Close">
            X
          </button>
        </div>

        <div className="chop__screen">
          <div className="maker__strip" aria-label="Sequence">
            {shown.map((s, i) => (
              <div
                key={i}
                className={`maker__block${s.kind === "silence" ? " maker__block--silence" : ""}${i === sel ? " maker__block--on" : ""}`}
                style={{ left: `${(shownStarts.starts[i] / stripSpan) * 100}%`, width: `${(s.eighths / stripSpan) * 100}%`, background: stripColor(s) }}
              />
            ))}
            <div className="maker__head" style={{ left: `${(at / stripSpan) * 100}%` }} />
          </div>
          <div className="chop__readout">
            <span>Bar {positionText(at, beatsPerBar)}</span>
            <span>
              {sel < slots.length ? `Slot ${sel + 1} of ${slots.length}` : `${slots.length} slot${slots.length === 1 ? "" : "s"}, next`}
            </span>
          </div>
        </div>

        <div className="maker__picker" ref={picker} onScroll={onScroll} style={{ paddingBlock: edge }}>
          {rows.map((key, j) => {
            const len = lenOf(key);
            const chop = key === "s" ? null : chops[key];
            return (
              <div
                key={String(key)}
                className={`maker__row${j === centered ? " maker__row--on" : ""}`}
                onPointerDown={down(key)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={cancel}
              >
                {Math.abs(j - centered) <= DRAW_NEAR && <RowCanvas peaks={chop ? peaksOf(key as number) : null} color={chop?.color ?? "#888"} eighths={spanOf(key)} len={Math.min(len, spanOf(key))} beatsPerBar={beatsPerBar} />}
                <span className="maker__label">{chop ? `Chop ${(key as number) + 1}  bar ${chop.barIndex + 1}` : "Silence"}</span>
                <span className="maker__len">{barsText(len, beatsPerBar)}</span>
              </div>
            );
          })}
        </div>

        <div className="chop__row">
          <button className="chop__btn chop__grow" disabled={sel === 0} onClick={() => select(sel - 1)} aria-label="Previous slot">
            ◀
          </button>
          <button className="chop__btn chop__grow" disabled={sel >= slots.length} onClick={() => select(sel + 1)} aria-label="Next slot">
            ▶
          </button>
          <button className="chop__btn chop__grow" disabled={sel >= slots.length} onClick={remove}>
            Remove
          </button>
        </div>
        <button className="chop__go" disabled={slots.length === 0} onClick={() => onDone(slots)}>
          Done
        </button>
      </div>
    </div>
  );
}
