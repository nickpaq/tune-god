import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAudioContext } from "../audio/decode";
import { prepareBuffer, startPad, type PadHandle } from "../audio/player";
import { columnPeaks, type PeakPyramid } from "../audio/song/waveform";
import { approach, approachSpan, centredStart, clampViewStart, defaultSpan, dragStep, isDrag, LATCH_DRAG_PX, spanAt, viewStart, zoomDepth, zoomRoom, type GrabbedView } from "../audio/song/zoom";

/** Size of a chop point's tab, in CSS pixels: wide enough for a thumb, and its top comes to a point. */
const TAB_WIDTH = 28;
const TAB_HEIGHT = 34;
const TAB_TIP = 12;
/** Room left at each side of the waveform so a tab at the very start or end of the song is drawn whole. */
const INSET = TAB_WIDTH / 2 + 2;
/** How long the view takes to ease back out after a tab is let go. */
const RETURN_MS = 320;
/** startPad keys voices by number: the chop preview has its own, so it never cuts a pad's. */
const PLAY_VOICE = -3;
/** How far ahead (seconds) the beat clicks are scheduled. */
const CLICK_AHEAD = 0.25;

interface TabDrag {
  kind: "tab";
  id: number;
  /** Position in `cuts` of the grabbed tab. */
  cut: number;
  startX: number;
  startY: number;
  lastX: number;
  /** False until the finger has travelled further than a tap: until then the tab has not moved and a release only centres it. */
  moved: boolean;
  /** Where the finger is now, kept up to date even while the marker is the playhead and not following it. */
  fingerX: number;
  fingerY: number;
  room: number;
  /** The span the view had when the tab was grabbed: the zoom a drag goes in from and a release returns to. */
  resting: number;
  grab: GrabbedView;
}

interface PanDrag {
  kind: "pan";
  id: number;
  lastX: number;
}

/** Playback from a chop point: the marker is the playhead, and the view follows it. */
interface Playback {
  handle: PadHandle;
  /** Position in `cuts` of the marker that is the playhead. */
  cut: number;
  /** A finger was holding the marker when playing began: the marker moves with the playhead, and keeps the place it stops at. */
  grabbed: boolean;
  /** The playhead, in frames. */
  frame: number;
  /** The view before playing began, put back after a playback that moved no marker. */
  saved: { start: number; span: number };
  last: number;
  raf: number;
  clickTimer: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return `${m}:${(Math.max(0, seconds) - m * 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * The song's waveform at full quality, in the screen's colours, with every chop point as a tab along the bottom (its top comes to a
 * point). The view rests at about half the song. Grab a tab and drag down to zoom in, smoothly, while sideways travel moves the point
 * by less and less time; let go and the point stays where it was put while the view eases back out. Dragging anywhere else pans.
 *
 * Playing: hold the play button (it fades out when let go, like a pad); slide down before letting go to keep it playing until it is
 * pressed again. Playback starts at the marker. With a marker held, the marker is the playhead: its line sits in the middle of the
 * view whatever the finger does, and when playing stops the marker keeps where it got to and slides back under the finger, carrying the
 * waveform with it, before the drag carries on.
 */
export function ChopTimeline({
  pyramid,
  sampleRate,
  cuts,
  selected,
  gridOrigin,
  beatFrames,
  beatsPerBar,
  onMoveCut,
  onReleaseCut,
  onSelect,
}: {
  pyramid: PeakPyramid;
  sampleRate: number;
  /** Every cut, in order: the frame each section starts at. */
  cuts: number[];
  selected: number;
  /** Frame of bar 1 beat 1 and frames per beat, for the beat lines that appear as the view zooms in and the clicks. */
  gridOrigin: number;
  beatFrames: number;
  beatsPerBar: number;
  onMoveCut: (cut: number, frame: number) => void;
  /** A tab was let go: the cut is final for this drag. */
  onReleaseCut: (cut: number) => void;
  onSelect: (cut: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const range = useRef<HTMLSpanElement>(null);
  const latest = useRef({ cuts, selected, gridOrigin, beatFrames, beatsPerBar, onMoveCut, onReleaseCut, onSelect });
  latest.current = { cuts, selected, gridOrigin, beatFrames, beatsPerBar, onMoveCut, onReleaseCut, onSelect };
  const total = pyramid.totalFrames;
  const resting = defaultSpan(total);
  const view = useRef({ start: 0, span: resting });
  const drag = useRef<TabDrag | PanDrag | null>(null);
  const returning = useRef(0);
  const buffers = useRef({ lo: new Float32Array(0), hi: new Float32Array(0) });

  const playback = useRef<Playback | null>(null);
  /** The marker sliding back under the finger after a pause. */
  const settling = useRef(0);
  const button = useRef<{ id: number; startY: number; stopsOnly: boolean } | null>(null);
  const lock = useRef<"none" | "armed" | "latched">("none");
  const [playState, setPlayState] = useState<"idle" | "holding" | "armed" | "latched">("idle");
  const [clicks, setClicks] = useState(true);
  const clicksOn = useRef(true);
  clicksOn.current = clicks;

  const clampStart = useCallback((start: number, span: number) => clampViewStart(start, span, total), [total]);

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(el.clientWidth * ratio));
    const h = Math.max(1, Math.round(el.clientHeight * ratio));
    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const ink = getComputedStyle(el).color;
    const { cuts: cutList, selected: chosen, gridOrigin: origin, beatFrames: beat, beatsPerBar: perBar } = latest.current;
    const { start, span } = view.current;
    el.dataset.start = String(Math.round(start));
    el.dataset.span = String(Math.round(span));
    el.dataset.playing = playback.current ? "true" : "false";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const inset = INSET * ratio;
    const inner = Math.max(1, w - 2 * inset);
    const tabHeight = TAB_HEIGHT * ratio;
    const plotHeight = h - tabHeight;
    const mid = plotHeight / 2;

    // The waveform itself, one full-resolution column per device pixel.
    if (buffers.current.lo.length !== inner) buffers.current = { lo: new Float32Array(inner), hi: new Float32Array(inner) };
    const { lo, hi } = buffers.current;
    columnPeaks(pyramid, start, span, inner, lo, hi);
    const scale = pyramid.peak > 0 ? (mid * 0.94) / pyramid.peak : 0;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(inset, Math.floor(mid), inner, Math.max(1, Math.round(ratio)));
    ctx.globalAlpha = 1;
    for (let c = 0; c < inner; c++) {
      const top = mid - hi[c] * scale;
      const bottom = mid - lo[c] * scale;
      ctx.fillRect(inset + c, top, 1, Math.max(1, bottom - top));
    }

    // Beat and bar lines, once the view is close enough for them to be apart.
    const perFrame = inner / span;
    const beatPx = beat * perFrame;
    if (beat > 0 && beatPx >= 7 * ratio) {
      ctx.fillStyle = ink;
      for (let n = Math.ceil((start - origin) / beat); origin + n * beat <= start + span; n++) {
        const bar = ((n % perBar) + perBar) % perBar === 0;
        if (!bar && beatPx < 12 * ratio) continue;
        ctx.globalAlpha = bar ? 0.4 : 0.16;
        ctx.fillRect(Math.round(inset + (origin + n * beat - start) * perFrame), 0, Math.max(1, Math.round(ratio)), plotHeight);
      }
    }
    ctx.globalAlpha = 1;

    // The chop points: a line up the waveform and a tab at the bottom with a pointed top. The chosen one is drawn last, and hollow.
    const playing = playback.current;
    const drawTab = (i: number) => {
      const frame = (playing?.grabbed && playing.cut === i ? playing.frame : drag.current?.kind === "tab" && drag.current.cut === i ? drag.current.grab.frame : cutList[i]) as number;
      const x = inset + (frame - start) * perFrame;
      const half = (TAB_WIDTH / 2) * ratio;
      if (x < -half || x > w + half) return;
      const on = i === chosen;
      const line = Math.max(1, Math.round(ratio * (on ? 2 : 1)));
      ctx.fillStyle = ink;
      ctx.globalAlpha = on ? 1 : 0.75;
      ctx.fillRect(Math.round(x - line / 2), 0, line, plotHeight);
      ctx.globalAlpha = 1;
      const tip = TAB_TIP * ratio;
      ctx.beginPath();
      ctx.moveTo(x, plotHeight);
      ctx.lineTo(x + half, plotHeight + tip);
      ctx.lineTo(x + half, h - 1);
      ctx.lineTo(x - half, h - 1);
      ctx.lineTo(x - half, plotHeight + tip);
      ctx.closePath();
      if (on) {
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2 * ratio;
        ctx.stroke();
      } else {
        ctx.fillStyle = ink;
        ctx.fill();
      }
      ctx.fillStyle = on ? ink : "#000";
      ctx.font = `${Math.round(8 * ratio)}px Silkscreen, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x, plotHeight + tip + (tabHeight - tip) / 2);
    };
    for (let i = 0; i < cutList.length; i++) if (i !== chosen) drawTab(i);
    if (chosen >= 0 && chosen < cutList.length) drawTab(chosen);

    // Playing from a marker that nobody is holding: the marker stays put and a playhead line runs along the waveform.
    if (playing && !playing.grabbed) {
      const x = Math.round(inset + (playing.frame - start) * perFrame);
      ctx.fillStyle = ink;
      ctx.fillRect(x - Math.round(ratio), 0, Math.max(2, Math.round(2 * ratio)), plotHeight);
    }

    if (range.current) range.current.textContent = `${formatTime(start / sampleRate)} - ${formatTime((start + span) / sampleRate)}`;
  }, [pyramid, sampleRate]);

  // Draws after every render (the cuts or the grid may have moved) and whenever the canvas is resized.
  useLayoutEffect(draw);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);

  // The first press of play should not wait for the song to be copied into an audio buffer.
  useEffect(() => {
    const timer = window.setTimeout(() => prepareBuffer(pyramid.channelData, sampleRate), 400);
    return () => window.clearTimeout(timer);
  }, [pyramid, sampleRate]);

  const centreRef = useRef<(cut: number) => void>(() => undefined);

  // Choosing a cut from outside (the nudge buttons, a new song) brings it into view, in the middle.
  const chosenFrame = cuts[selected];
  useEffect(() => {
    if (drag.current || playback.current || chosenFrame === undefined) return;
    const { start, span } = view.current;
    if (chosenFrame < start || chosenFrame > start + span) centreRef.current(selected);
  }, [selected, chosenFrame]);

  /** Where the finger holding a marker is across the view (0 = left edge, 1 = right). */
  const fingerAcross = (d: TabDrag) => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return d.grab.across;
    return Math.min(0.98, Math.max(0.02, (d.fingerX - rect.left - INSET) / Math.max(1, rect.width - 2 * INSET)));
  };

  /** The span a held marker's finger asks for: the further down the finger is from where it grabbed, the closer in. */
  const spanFor = (d: TabDrag) => spanAt(zoomDepth(d.fingerY - d.startY, d.room), d.resting);

  /** The view eases from where it is to `target` (read afresh each frame, so it can be a moving thing). */
  const animateView = (target: () => { start: number; span: number }) => {
    cancelAnimationFrame(returning.current);
    const from = { ...view.current };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / RETURN_MS);
      const eased = 1 - (1 - t) ** 3;
      const to = target();
      const span = from.span * Math.pow(to.span / from.span, eased);
      view.current = { start: from.start + (to.start - from.start) * eased, span };
      draw();
      if (t < 1) returning.current = requestAnimationFrame(step);
    };
    returning.current = requestAnimationFrame(step);
  };

  /** The point stays where it was put; the view eases back out around it, keeping it at the same place across the screen. */
  const easeBackOut = (grab: GrabbedView, restingSpan: number) =>
    animateView(() => ({ start: clampStart(grab.frame - grab.across * restingSpan, restingSpan), span: restingSpan }));

  /** The view eases to put a cut in the middle, at the zoom it has now. */
  const centreOn = (cut: number) => {
    const frame = latest.current.cuts[cut];
    if (frame === undefined) return;
    const span = view.current.span;
    animateView(() => ({ start: clampStart(centredStart(latest.current.cuts[cut] ?? frame, span), span), span }));
  };
  centreRef.current = centreOn;

  /** After a pause: the marker slides from the middle back under the finger, carrying the waveform, then the drag carries on. */
  const settleUnderFinger = (d: TabDrag, frame: number) => {
    cancelAnimationFrame(settling.current);
    d.grab = { frame, across: 0.5, span: view.current.span };
    let last = performance.now();
    const step = (now: number) => {
      if (drag.current !== d) return;
      const target = fingerAcross(d);
      const span = spanFor(d);
      const across = approach(d.grab.across, target, now - last);
      last = now;
      const done = Math.abs(across - target) < 0.002;
      d.grab = { frame, across: done ? target : across, span };
      view.current = { start: viewStart(d.grab), span };
      draw();
      if (done) {
        settling.current = 0;
        d.lastX = d.fingerX;
      } else settling.current = requestAnimationFrame(step);
    };
    settling.current = requestAnimationFrame(step);
  };

  const stopRef = useRef<() => void>(() => undefined);

  /** Stops playing (the sound fades out like a pad's) and puts the markers and the view where they belong. */
  const stopPlayback = () => {
    const p = playback.current;
    if (!p) return;
    playback.current = null;
    cancelAnimationFrame(p.raf);
    window.clearInterval(p.clickTimer);
    const frame = Math.round(Math.min(total, Math.max(0, p.handle.position() * sampleRate)));
    p.handle.release();
    lock.current = "none";
    setPlayState("idle");
    const d = drag.current;
    if (p.grabbed) {
      // The marker was the playhead: it keeps the place it got to.
      latest.current.onMoveCut(p.cut, frame);
      if (d && d.kind === "tab" && d.cut === p.cut) {
        d.moved = true;
        settleUnderFinger(d, frame);
      }
      else {
        latest.current.onReleaseCut(p.cut);
        easeBackOut({ frame, across: 0.5, span: view.current.span }, resting);
      }
    } else {
      const saved = p.saved;
      animateView(() => saved);
    }
  };
  stopRef.current = stopPlayback;

  /** Plays from the marker: the one a finger is holding, else the chosen one. */
  const startPlayback = () => {
    if (playback.current) return;
    cancelAnimationFrame(returning.current);
    cancelAnimationFrame(settling.current);
    settling.current = 0;
    const d = drag.current?.kind === "tab" ? (drag.current as TabDrag) : null;
    const cut = d ? d.cut : latest.current.selected;
    const from = d ? d.grab.frame : latest.current.cuts[cut];
    if (from === undefined) return;

    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const handle = startPad(PLAY_VOICE, pyramid.channelData, sampleRate, 0, null, "hold", () => stopRef.current(), 0, Math.max(0, from) / sampleRate);

    // Beat clicks, scheduled a little ahead of the playhead.
    const { beatFrames: beat, gridOrigin: origin, beatsPerBar: perBar } = latest.current;
    let next = Math.ceil((from - origin) / beat - 1e-6);
    const clickTimer = window.setInterval(() => {
      if (!clicksOn.current || !(beat > 0)) return;
      const now = handle.position();
      for (;;) {
        const at = (origin + next * beat) / sampleRate;
        if (at > now + CLICK_AHEAD) break;
        if (at >= now - 0.02) {
          const when = ctx.currentTime + Math.max(0, at - now);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = ((next % perBar) + perBar) % perBar === 0 ? 1600 : 1000;
          gain.gain.setValueAtTime(0.25, when);
          gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
          osc.connect(gain).connect(ctx.destination);
          osc.start(when);
          osc.stop(when + 0.05);
        }
        next++;
      }
    }, 40);

    const p: Playback = { handle, cut, grabbed: !!d, frame: from, saved: { ...view.current }, last: performance.now(), raf: 0, clickTimer };
    playback.current = p;
    // The view follows the playhead, which sits in the middle. A held marker is the playhead; the finger can still zoom, but not move it.
    const follow = (now: number) => {
      if (playback.current !== p) return;
      p.frame = Math.min(total, p.handle.position() * sampleRate);
      const held = drag.current?.kind === "tab" && p.grabbed ? (drag.current as TabDrag) : null;
      let span = view.current.span;
      if (held) {
        span = spanFor(held);
        held.grab = { frame: p.frame, across: 0.5, span };
      } else if (p.grabbed) span = approachSpan(span, resting, now - p.last);
      p.last = now;
      view.current = { start: p.frame - span / 2, span };
      draw();
      if (p.frame >= total) stopRef.current();
      else p.raf = requestAnimationFrame(follow);
    };
    p.raf = requestAnimationFrame(follow);
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(returning.current);
      cancelAnimationFrame(settling.current);
      const p = playback.current;
      if (p) {
        cancelAnimationFrame(p.raf);
        window.clearInterval(p.clickTimer);
        p.handle.release();
        playback.current = null;
      }
    },
    [],
  );

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, height: rect.height };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (drag.current) return; // one finger holds the timeline at a time
    cancelAnimationFrame(returning.current);
    const { x, y, width: full, height } = pointer(e);
    const width = full - 2 * INSET;
    const { start, span } = view.current;
    const { cuts: cutList } = latest.current;
    // The tab whose point is nearest the finger, if the finger is down in the tabs.
    let hit = -1;
    let best = Infinity;
    if (!playback.current) {
      cutList.forEach((frame, i) => {
        const distance = Math.abs(INSET + ((frame - start) / span) * width - x);
        if (y >= height - TAB_HEIGHT - 6 && distance <= TAB_WIDTH / 2 + 4 && distance < best) {
          best = distance;
          hit = i;
        }
      });
    }
    if (hit >= 0) {
      latest.current.onSelect(hit);
      drag.current = {
        kind: "tab",
        id: e.pointerId,
        cut: hit,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        moved: false,
        fingerX: e.clientX,
        fingerY: e.clientY,
        room: zoomRoom(e.clientY, window.innerHeight),
        resting: span,
        grab: { frame: cutList[hit], across: (cutList[hit] - start) / span, span },
      };
    } else drag.current = { kind: "pan", id: e.pointerId, lastX: e.clientX };
    draw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const width = pointer(e).width - 2 * INSET;
    if (d.kind === "pan") {
      if (playback.current) return;
      const { start, span } = view.current;
      view.current = { start: clampStart(start - ((e.clientX - d.lastX) / width) * span, span), span };
      d.lastX = e.clientX;
      return draw();
    }
    d.fingerX = e.clientX;
    d.fingerY = e.clientY;
    // While the marker is the playhead, or sliding back to the finger, the finger only says where to slide to and how far to zoom.
    if (playback.current || settling.current) {
      d.lastX = e.clientX;
      return;
    }
    // A tap must not nudge the point: nothing moves until the finger has gone further than a tap. From there it carries on from where it is.
    if (!d.moved) {
      if (!isDrag(e.clientX - d.startX, e.clientY - d.startY)) return;
      d.moved = true;
      d.lastX = e.clientX;
      return;
    }
    // Further down, closer in. The point stays under the finger and a pixel of travel covers less time the closer the view is.
    const span = spanFor(d);
    const next = dragStep(d.grab, e.clientX - d.lastX, width, span);
    d.lastX = e.clientX;
    next.frame = Math.min(total, Math.max(0, next.frame));
    d.grab = next;
    view.current = { start: viewStart(next), span };
    latest.current.onMoveCut(d.cut, Math.round(next.frame));
    draw();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.kind !== "tab") return;
    cancelAnimationFrame(settling.current);
    settling.current = 0;
    // Let go while the marker is the playhead: it carries on playing, and is placed when playing stops.
    if (playback.current?.grabbed) return;
    // A tap: the point has not moved. It is the chosen one now, and the view brings it to the middle.
    if (!d.moved) return centreOn(d.cut);
    latest.current.onReleaseCut(d.cut);
    easeBackOut(d.grab, d.resting);
  };

  /** The arrows: choose the previous or the next chop point and bring it to the middle. */
  const step = (direction: number) => {
    if (playback.current || drag.current) return;
    const next = Math.min(latest.current.cuts.length - 1, Math.max(0, latest.current.selected + direction));
    if (next === latest.current.selected && latest.current.cuts[next] !== undefined) return centreOn(next);
    latest.current.onSelect(next);
    centreOn(next);
  };

  const onPlayDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (button.current) return;
    // Pressed again while locked on: that press stops it.
    if (lock.current === "latched") {
      button.current = { id: e.pointerId, startY: e.clientY, stopsOnly: true };
      stopPlayback();
      return;
    }
    button.current = { id: e.pointerId, startY: e.clientY, stopsOnly: false };
    lock.current = "none";
    startPlayback();
    setPlayState(playback.current ? "holding" : "idle");
  };

  const onPlayMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const b = button.current;
    if (!b || b.id !== e.pointerId || b.stopsOnly || !playback.current) return;
    const armed = e.clientY - b.startY >= LATCH_DRAG_PX;
    lock.current = armed ? "armed" : "none";
    setPlayState(armed ? "armed" : "holding");
  };

  const onPlayUp = (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const b = button.current;
    if (!b || b.id !== e.pointerId) return;
    button.current = null;
    if (b.stopsOnly) return;
    // Slid down before letting go: keep playing until the button is pressed again.
    if (lock.current === "armed" && !cancelled && playback.current) {
      lock.current = "latched";
      setPlayState("latched");
    } else stopPlayback();
  };

  const label = playState === "latched" ? "Playing: press to stop" : playState === "armed" ? "Let go to lock" : playState === "holding" ? "Slide down to lock" : "Hold to play";

  return (
    <div className="chop-timeline">
      <canvas
        ref={canvas}
        className="chop-timeline__canvas"
        aria-label="Song waveform with the chop points"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="chop-timeline__bar">
        <button className="chop__btn" onClick={() => step(-1)} disabled={selected <= 0} aria-label="Previous chop point">
          ◀
        </button>
        <span ref={range} className="chop-timeline__range" />
        <button className="chop__btn" onClick={() => step(1)} disabled={selected >= cuts.length - 1} aria-label="Next chop point">
          ▶
        </button>
      </div>
      <div className="chop-timeline__play">
        <button
          className={`chop__play${playState !== "idle" ? " chop__play--on" : ""}${playState === "armed" || playState === "latched" ? " chop__play--lock" : ""}`}
          aria-label="Play from the marker: hold to play, slide down and let go to keep playing"
          aria-pressed={playState !== "idle"}
          onPointerDown={onPlayDown}
          onPointerMove={onPlayMove}
          onPointerUp={(e) => onPlayUp(e, false)}
          onPointerCancel={(e) => onPlayUp(e, true)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="chop__play-icon">{playState === "latched" ? "■" : "▶"}</span>
          <span>{label}</span>
        </button>
        <button className="chop__btn chop__clicks" aria-pressed={clicks} onClick={() => setClicks((on) => !on)} title="A click on every beat while playing">
          Clicks {clicks ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}
