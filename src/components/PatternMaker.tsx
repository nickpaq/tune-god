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
/** The share of a row's width left of the playhead, where the end of the slot before shows. */
const MARGIN = 0.1;
/** A finger held this long (ms) on a row plays the chop; a scroll that starts sooner does not. */
const HOLD_MS = 70;
/** Two taps this close together (ms) on a row are a double tap. */
const DOUBLE_MS = 320;
/** A finger that moves this far (CSS pixels) is dragging, not tapping. */
const DRAG_PX = 8;
/** How quickly the view zooms to the centred chop: the share of the way it goes each frame. */
const ZOOM_EASE = 0.22;
/** After the list is scrolled by the screen itself (not a finger), rows passing the middle do not play for this long (ms). */
const AUTO_SCROLL_MS = 900;

type RowKey = number | "s";
interface Peaks {
  min: Float32Array;
  max: Float32Array;
}

/**
 * One row, drawn the way the chop editor's screen is: black, the chop shaded in its colour with the waveform in the screen's ink over it, the bar lines over
 * that, and a line in the chop's colour where it starts. The playhead is the line near the left, with the end of the slot before shaded to its left. The row
 * is one beat-square tall. Every row is on the same scale (`span` eighth notes across the rest), so the chops line up as blocks.
 */
function RowCanvas({ peaks, scale, color, tail, eighths, len, span, beatsPerBar }: { peaks: Peaks | null; scale: number; color: string; tail: string | null; eighths: number; len: number; span: number; beatsPerBar: number }) {
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
    const x0 = Math.round(w * MARGIN);
    const x = (e: number) => x0 + (e / span) * (w - x0);
    const mid = h / 2;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // The end of the slot before, to the left of the playhead.
    if (tail) {
      ctx.fillStyle = tail;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(0, 0, x0, h);
    }
    // The chop, shaded in its colour, with its waveform; what will not play is dimmed.
    const full = Math.min(w, Math.round(x(eighths)));
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x0, 0, full - x0, h);
    ctx.fillStyle = ink;
    ctx.fillRect(x0, Math.floor(mid), full - x0, one);
    ctx.globalAlpha = 1;
    if (peaks && full > x0) {
      const k = (h / 2) * 0.94 * scale;
      const width = full - x0;
      for (let col = 0; col < width; col++) {
        const i = Math.min(COLUMNS - 1, Math.floor((col / width) * COLUMNS));
        const up = mid - peaks.max[i] * k;
        const down = mid - peaks.min[i] * k;
        ctx.fillRect(x0 + col, up, 1, Math.max(1, down - up));
      }
    }
    if (len < eighths) {
      const from = Math.min(w, Math.round(x(len)));
      ctx.fillStyle = "#000";
      ctx.globalAlpha = 0.55;
      ctx.fillRect(from, 0, Math.max(0, full - from), h);
      ctx.globalAlpha = 1;
    }

    // Bar lines as strong as the chop editor's, beats and eighths faint.
    for (let e = 0; x(e) <= w; e++) {
      const isBar = e % (beatsPerBar * 2) === 0;
      ctx.fillStyle = ink;
      ctx.globalAlpha = isBar ? 0.6 : e % 2 === 0 ? 0.2 : 0.08;
      const thick = isBar ? Math.max(2, Math.round(1.5 * ratio)) : one;
      ctx.fillRect(Math.round(x(e)) - Math.floor(thick / 2), 0, thick, h);
    }
    ctx.globalAlpha = 1;

    // The chop's own line where it starts, and over it the playhead.
    const thick = Math.max(2, Math.round(2 * ratio));
    if (peaks) {
      ctx.fillStyle = color;
      ctx.fillRect(x0, 0, thick, h);
    }
    ctx.fillStyle = ink;
    ctx.fillRect(x0 - thick, 0, thick, h);
  }, [peaks, scale, color, tail, eighths, len, span, beatsPerBar]);
  return <canvas ref={ref} className="maker__canvas" />;
}

/**
 * The pattern maker (chopper mode, "Finish and open pattern maker"): the chops stacked in a scrolling list, one beat-square tall each, the one nearest the
 * playhead's place in the bar at the bottom. The row in the middle (the selection zone) is the one that counts. Holding a row plays that chop; a double tap
 * puts it at the playhead (and the playhead moves to its end); dragging along a row sets how many eighth notes of it play, and dragging back past nothing cuts
 * the chop before it short. With Scroll play on, rows play as they scroll into the zone. The view zooms out to fit a chop longer than it shows. The arrows
 * select a slot to change; the transport plays the sequence; Done hands it back.
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
  const [visible, setVisible] = useState(12);
  const [scrollPlay, setScrollPlay] = useState(false);

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
    const measure = () => {
      setEdge(Math.max(0, (el.clientHeight - rowHeight()) / 2));
      setVisible(Math.ceil(el.clientHeight / rowHeight() / 2) + 2);
    };
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
  /** Until when (performance.now) a scroll is the screen's own, not a finger's. */
  const autoUntil = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    const el = picker.current;
    if (!el || (edge === 0 && first.current)) return;
    autoUntil.current = performance.now() + AUTO_SCROLL_MS;
    el.scrollTo({ top: targetRow * rowHeight(), behavior: first.current ? "auto" : "smooth" });
    first.current = false;
    setCentered(targetRow);
    // follows the selection and the order, not every length change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRow, sel, edge]);
  const lastCentered = useRef(-1);
  const onScroll = () => {
    const el = picker.current;
    if (!el) return;
    const c = Math.max(0, Math.min(rows.length - 1, Math.round(el.scrollTop / rowHeight())));
    setCentered(c);
    if (c === lastCentered.current) return;
    lastCentered.current = c;
    // With Scroll play on, each row that reaches the zone under a finger's scroll plays, cutting the one before.
    if (scrollPlay && performance.now() > autoUntil.current && rows[c] !== "s") playChop(rows[c] as number, lenOf(rows[c]));
  };

  // ---- the finger on a row ----
  const touch = useRef<{ key: RowKey; x: number; y: number; width: number; startLen: number; dragging: boolean; hold: number; held: boolean } | null>(null);
  const lastTap = useRef<{ key: RowKey; at: number } | null>(null);
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
    const t = { key, x: e.clientX, y: e.clientY, width: e.currentTarget.clientWidth * (1 - MARGIN), startLen: lenOf(key), dragging: false, hold: 0, held: false };
    // Held, the chop plays; a scroll that starts first cancels it.
    t.hold = window.setTimeout(() => {
      if (touch.current === t && !t.dragging && key !== "s") {
        t.held = true;
        playChop(key, lenOf(key));
      }
    }, HOLD_MS);
    touch.current = t;
  };
  const endHold = (t: NonNullable<typeof touch.current>) => {
    window.clearTimeout(t.hold);
    if (t.held) stopPlay();
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.clientX - t.x;
    if (!t.dragging) {
      if (Math.abs(dx) < DRAG_PX || Math.abs(dx) < Math.abs(e.clientY - t.y)) return;
      t.dragging = true;
      endHold(t);
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
    endHold(t);
    if (!t.dragging) {
      // A double tap puts the chop at the playhead.
      const now = performance.now();
      const before = lastTap.current;
      if (before && before.key === t.key && now - before.at < DOUBLE_MS) {
        lastTap.current = null;
        return confirm(t.key);
      }
      lastTap.current = { key: t.key, at: now };
      return;
    }
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
    const t = touch.current;
    touch.current = null;
    if (t) endHold(t);
    setTrim(0);
  };

  const remove = () => {
    if (sel >= slots.length) return;
    stopPlay();
    setSlots(slots.filter((_, i) => i !== sel));
    setLens({});
  };

  // ---- playing ----
  const [volume, setVolume] = useState(0.7);
  const [playAt, setPlayAt] = useState<number | null>(null);
  const voice = useRef<{ source: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number; sequence: boolean } | null>(null);
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
  /** Starts a buffer (cutting whatever plays) from `offset` seconds. */
  const startBuffer = (data: Float32Array[], offset: number, sequence: boolean) => {
    stopPlay();
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const buffer = ctx.createBuffer(data.length, Math.max(1, data[0].length), sampleRate);
    data.forEach((d, c) => buffer.copyToChannel(d as Float32Array<ArrayBuffer>, c));
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current ** 2;
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    const from = Math.min(offset, buffer.duration);
    source.start(0, from);
    const v = { source, gain, startedAt: ctx.currentTime, offset: from, sequence };
    voice.current = v;
    source.onended = () => {
      if (voice.current === v) {
        voice.current = null;
        setPlayAt(null);
      }
    };
  };
  const play = (fromEighth: number) => {
    if (slots.length === 0) return;
    startBuffer(renderSequence(channelData, chops, slots, beatFrames), fromEighth * eighthSeconds, true);
  };
  /** One chop on its own: its first `eighths` eighth notes. */
  function playChop(chop: number, eighths: number) {
    const c = chops[chop];
    const frames = Math.min(Math.round((eighths * beatFrames) / 2), c.length);
    const from = Math.max(0, c.start);
    startBuffer(
      channelData.map((d) => d.subarray(from, Math.min(d.length, from + frames))),
      0,
      false,
    );
  }
  useEffect(() => {
    if (voice.current) voice.current.gain.gain.value = volume ** 2;
  }, [volume]);
  useEffect(() => {
    if (playAt === null) return;
    let raf = 0;
    const tick = () => {
      const v = voice.current;
      if (!v || !v.sequence) return;
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
  /** The slot before the selected one: the end of it shows left of the playhead in every row. */
  const before = sel > 0 ? shown[sel - 1] : undefined;
  const tail = before ? (before.kind === "chop" ? chops[before.chop].color : "#8a8a8a") : null;

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

        <div className="maker__well">
          <div className="maker__picker" ref={picker} onScroll={onScroll} style={{ paddingBlock: edge }}>
            {rows.map((key, j) => {
              const chop = key === "s" ? null : chops[key];
              return (
                <div key={String(key)} className="maker__row" onPointerDown={down(key)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
                  {Math.abs(j - centered) <= visible && (
                    <RowCanvas
                      peaks={chop ? peaksOf(key as number) : null}
                      scale={scale}
                      color={chop?.color ?? "#8a8a8a"}
                      tail={tail}
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
          <div className="maker__zone" />
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
        <div className="chop__row maker__transport">
          <button className="chop__btn chop__grow" disabled={sel === 0} onClick={() => select(sel - 1)} aria-label="Previous slot">
            ◀
          </button>
          <button className="chop__btn chop__grow" disabled={sel >= slots.length} onClick={() => select(sel + 1)} aria-label="Next slot">
            ▶
          </button>
          <button className="chop__btn chop__grow" disabled={sel >= slots.length} onClick={remove}>
            Remove
          </button>
          <button className="chop__btn chop__grow" aria-pressed={scrollPlay} onClick={() => setScrollPlay((on) => !on)} title="Plays each chop as it scrolls into the middle">
            Scroll play
          </button>
        </div>
        <button className="chop__go" disabled={slots.length === 0} onClick={() => onDone(slots)}>
          Done
        </button>
      </div>
    </div>
  );
}
