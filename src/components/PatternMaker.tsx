import { useEffect, useMemo, useRef, useState } from "react";
import { getAudioContext } from "../audio/decode";
import { buildPyramid, columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import {
  chopEighths,
  defaultSilence,
  dragLength,
  maxSilence,
  MIN_EIGHTHS,
  orderChops,
  positionText,
  renderSequence,
  setSlot,
  slotStarts,
  type MakerChop,
  type Slot,
} from "../audio/song/patternMaker";
import { Knob } from "./Knob";

/** Columns of waveform kept for each chop. */
const COLUMNS = 1024;
/** The least the rows show across their width, in bars: longer chops zoom the view out to fit. */
const MIN_SPAN_BARS = 4;
/** A finger that moves this far (CSS pixels) is dragging, not tapping. */
const DRAG_PX = 8;
/** Rows this far from the centred one (or less) are drawn. */
const DRAW_NEAR = 3;
/** The strip along the top of a row that carries its flag, as in the chop editor (CSS pixels). */
const FLAG_H = 14;
/** How quickly the view zooms to the centred chop: the share of the way it goes each frame. */
const ZOOM_EASE = 0.22;

type RowKey = number | "s";
interface Peaks {
  min: Float32Array;
  max: Float32Array;
}

const lengthText = (eighths: number, beatsPerBar: number) => {
  const bars = eighths / (beatsPerBar * 2);
  return `${+bars.toFixed(2)} BAR${bars === 1 ? "" : "S"}`;
};

/**
 * One row, drawn the way the chop editor's screen is: black, the waveform in the screen's ink one column to a device pixel, the bar lines over it, the chop
 * shaded in its colour with a numbered flag where it starts, and a cursor line (with its triangle) at the end of the part that will play. Every row is on
 * the same scale (`span` eighth notes across), so a shorter chop only fills part of the width.
 */
function RowCanvas({ peaks, scale, color, flag, eighths, len, span, beatsPerBar }: { peaks: Peaks | null; scale: number; color: string; flag: string; eighths: number; len: number; span: number; beatsPerBar: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(el.clientWidth * ratio));
    const h = Math.max(1, Math.round(el.clientHeight * ratio));
    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const ink = getComputedStyle(el).color;
    const one = Math.max(1, Math.round(ratio));
    const top = FLAG_H * ratio;
    const mid = (top + h) / 2;
    const x = (e: number) => (e / span) * w;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // The chop, shaded in its colour: the part that plays brighter than the rest.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(0, top, Math.min(w, x(len)), h - top);
    ctx.globalAlpha = 0.12;
    ctx.fillRect(Math.min(w, x(len)), top, Math.max(0, Math.min(w, x(eighths)) - x(len)), h - top);

    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(0, Math.floor(mid), w, one);
    ctx.globalAlpha = 1;
    if (peaks) {
      const width = Math.min(w, Math.round(x(eighths)));
      const k = (((h - top) / 2) * 0.94) * scale;
      for (let col = 0; col < width; col++) {
        const i = Math.min(COLUMNS - 1, Math.floor((col / width) * COLUMNS));
        const up = mid - peaks.max[i] * k;
        const down = mid - peaks.min[i] * k;
        ctx.fillRect(col, up, 1, Math.max(1, down - up));
      }
    }

    // Eighth notes and beats faintly, the bars as strong as the chop editor's.
    const bar = beatsPerBar * 2;
    for (let e = 0; e * 1 <= span; e++) {
      const isBar = e % bar === 0;
      const isBeat = e % 2 === 0;
      ctx.fillStyle = ink;
      ctx.globalAlpha = isBar ? 0.6 : isBeat ? 0.2 : 0.09;
      const thick = isBar ? Math.max(2, Math.round(1.5 * ratio)) : one;
      ctx.fillRect(Math.round(x(e)) - Math.floor(thick / 2), top, thick, h - top);
    }
    ctx.globalAlpha = 1;

    ctx.font = `${Math.round(8 * ratio)}px Silkscreen, monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const fw = (flag.length * 5 + 8) * ratio;
    ctx.fillStyle = color === "#888" ? ink : color;
    ctx.fillRect(0, 0, fw, top);
    ctx.fillStyle = "#000";
    ctx.fillText(flag, fw / 2, top / 2 + ratio);
    ctx.textAlign = "right";
    ctx.fillStyle = ink;
    ctx.fillText(lengthText(len, beatsPerBar), w - 6 * ratio, top / 2 + ratio);

    // The end of what plays: the line, and its triangle, like the chop editor's cursor.
    const cx = Math.min(w - 2, Math.round(x(len)));
    ctx.fillRect(cx - one, 0, Math.max(2, Math.round(2 * ratio)), h);
    const half = 5 * ratio;
    ctx.beginPath();
    ctx.moveTo(cx - half, top);
    ctx.lineTo(cx + half, top);
    ctx.lineTo(cx, top + 7 * ratio);
    ctx.closePath();
    ctx.fill();
  }, [peaks, scale, color, flag, eighths, len, span, beatsPerBar]);
  return <canvas ref={ref} className="maker__canvas" />;
}

/**
 * The pattern maker (chopper mode, "Finish and open pattern maker"): the chops stacked in a scrolling list, the one nearest the playhead's place in the
 * bar at the bottom. A tap puts that chop at the playhead (and the playhead moves to its end); dragging along a row sets how many eighth notes of it
 * play, and dragging back past nothing cuts the chop before it short. The view zooms out to fit a chop longer than it shows. The arrows select a slot to
 * change; the transport plays the sequence; Done hands it back.
 */
export function PatternMaker({
  channelData,
  sampleRate,
  chops,
  beatsPerBar,
  beatFrames,
  initial,
  onDone,
  onClose,
}: {
  channelData: Float32Array[];
  sampleRate: number;
  chops: MakerChop[];
  beatsPerBar: number;
  /** The sample's frames to a beat at its own tempo. */
  beatFrames: number;
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
  const scale = pyramid.peak > 0 ? 1 / pyramid.peak : 1;
  const peakCache = useRef(new Map<number, Peaks>());
  const peaksOf = (i: number): Peaks => {
    let hit = peakCache.current.get(i);
    if (!hit) {
      hit = { min: new Float32Array(COLUMNS), max: new Float32Array(COLUMNS) };
      columnPeaks(pyramid, chops[i].start, chops[i].length, COLUMNS, hit.min, hit.max);
      peakCache.current.set(i, hit);
    }
    return hit;
  };

  const { starts, total } = slotStarts(slots);
  const playhead = sel < slots.length ? starts[sel] : total;
  /** The rows from the top down: the last chop of the order first, the silence last (just below the bottommost chop). */
  const rows = useMemo<RowKey[]>(() => [...orderChops(chops, playhead, beatsPerBar).reverse(), "s"], [chops, playhead, beatsPerBar]);

  const fullOf = (key: RowKey) => (key === "s" ? defaultSilence(beatsPerBar) : chopEighths(chops[key], beatsPerBar));
  const maxOf = (key: RowKey) => (key === "s" ? maxSilence(beatsPerBar) : chopEighths(chops[key], beatsPerBar));
  /** What a row would play now: what the finger set, else the selected slot's own length when it holds this chop, else the whole chop (a bar of silence). */
  const lenOf = (key: RowKey) => {
    const set = lens[String(key)];
    if (set !== undefined) return set;
    const slot = sel < slots.length ? slots[sel] : undefined;
    if (slot && (key === "s" ? slot.kind === "silence" : slot.kind === "chop" && slot.chop === key)) return slot.eighths;
    return fullOf(key);
  };

  // ---- the zoom: every row is on one scale, wide enough for the centred chop (or silence) and never under MIN_SPAN_BARS ----
  const minSpan = MIN_SPAN_BARS * beatsPerBar * 2;
  const centeredKey = rows[Math.min(centered, rows.length - 1)];
  const targetSpan = Math.max(minSpan, centeredKey === "s" ? lenOf("s") : fullOf(centeredKey));
  const [span, setSpan] = useState(targetSpan);
  const spanRef = useRef(span);
  const targetRef = useRef(targetSpan);
  targetRef.current = targetSpan;
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const d = targetRef.current - spanRef.current;
      spanRef.current = Math.abs(d) < 0.02 ? targetRef.current : spanRef.current + d * ZOOM_EASE;
      setSpan(spanRef.current);
      if (spanRef.current !== targetRef.current) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetSpan]);

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
    if (!el || (edge === 0 && first.current)) return;
    el.scrollTo({ top: targetRow * rowHeight(), behavior: first.current ? "auto" : "smooth" });
    first.current = false;
    if (first.current === false) setCentered(targetRow);
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
    stopPlay();
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
    const { eighths, trim: cut } = dragLength(t.startLen + Math.round((dx / t.width) * spanRef.current), maxOf(t.key));
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
      stopPlay();
    }
    setTrim(0);
  };
  const cancel = () => {
    touch.current = null;
    setTrim(0);
  };

  const remove = () => {
    if (sel >= slots.length) return;
    stopPlay();
    setSlots(slots.filter((_, i) => i !== sel));
    setLens({});
  };

  // ---- playing the sequence ----
  const [volume, setVolume] = useState(0.7);
  const [playAt, setPlayAt] = useState<number | null>(null);
  const voice = useRef<{ source: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number } | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const eighthSeconds = beatFrames / 2 / sampleRate;
  function stopPlay() {
    const v = voice.current;
    voice.current = null;
    if (v) {
      v.source.onended = null;
      try {
        v.source.stop();
      } catch {
        /* already stopped */
      }
    }
    setPlayAt(null);
  }
  const play = (fromEighth: number) => {
    stopPlay();
    if (slots.length === 0) return;
    const data = renderSequence(channelData, chops, slots, beatFrames);
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const buffer = ctx.createBuffer(data.length, data[0].length, sampleRate);
    data.forEach((d, c) => buffer.copyToChannel(d as Float32Array<ArrayBuffer>, c));
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current ** 2;
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    const offset = Math.min(fromEighth * eighthSeconds, buffer.duration);
    source.start(0, offset);
    const v = { source, gain, startedAt: ctx.currentTime, offset };
    voice.current = v;
    source.onended = () => {
      if (voice.current === v) {
        voice.current = null;
        setPlayAt(null);
      }
    };
  };
  useEffect(() => {
    if (voice.current) voice.current.gain.gain.value = volume ** 2;
  }, [volume]);
  useEffect(() => {
    if (playAt === null) return;
    let raf = 0;
    const tick = () => {
      const v = voice.current;
      if (!v) return;
      setPlayAt((v.offset + (getAudioContext().currentTime - v.startedAt)) / eighthSeconds);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // runs while a voice plays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playAt === null]);
  useEffect(() => stopPlay, []);
  const barEighths = beatsPerBar * 2;
  const lastBar = Math.max(0, Math.floor((total - 1) / barEighths)) * barEighths;

  // ---- the sequence strip ----
  const shown = trim > 0 && sel > 0 ? setSlot(slots, sel - 1, { ...slots[sel - 1], eighths: slots[sel - 1].eighths - trim }) : slots;
  const shownStarts = slotStarts(shown);
  const stripSpan = Math.max(barEighths * 8, shownStarts.total + barEighths * 2);
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
            {playAt !== null && <div className="maker__play" style={{ left: `${(Math.min(playAt, stripSpan) / stripSpan) * 100}%` }} />}
          </div>
          <div className="chop__readout">
            <span>Bar {positionText(at, beatsPerBar)}</span>
            <span>{sel < slots.length ? `Slot ${sel + 1} of ${slots.length}` : `${slots.length} slot${slots.length === 1 ? "" : "s"}, next`}</span>
          </div>
        </div>

        <div className="maker__picker" ref={picker} onScroll={onScroll} style={{ paddingBlock: edge }}>
          {rows.map((key, j) => {
            const chop = key === "s" ? null : chops[key];
            return (
              <div key={String(key)} className={`maker__row${j === centered ? " maker__row--on" : ""}`} onPointerDown={down(key)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
                {Math.abs(j - centered) <= DRAW_NEAR && (
                  <RowCanvas
                    peaks={chop ? peaksOf(key as number) : null}
                    scale={scale}
                    color={chop?.color ?? "#888"}
                    flag={chop ? String((key as number) + 1) : "SIL"}
                    eighths={chop ? fullOf(key) : lenOf("s")}
                    len={Math.min(lenOf(key), maxOf(key))}
                    span={span}
                    beatsPerBar={beatsPerBar}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="chop__row maker__transport">
          <button className="chop__btn chop__grow" disabled={slots.length === 0} onClick={() => play(at)} aria-label="Play from the playhead">
            ▶ Play
          </button>
          <button className="chop__btn chop__grow" disabled={slots.length === 0} onClick={() => play(lastBar)} aria-label="Play from the start of the last bar">
            ▶ Last bar
          </button>
          <button className="chop__btn chop__grow" disabled={slots.length === 0} onClick={() => play(0)} aria-label="Play from the start">
            ▶ Start
          </button>
          <button className="chop__btn chop__grow" onClick={stopPlay} aria-label="Stop">
            ■ Stop
          </button>
          <Knob value={volume} onChange={setVolume} label="Volume" />
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
