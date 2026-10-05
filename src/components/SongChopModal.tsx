import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Comlink from "comlink";
import { nextAnalysisWorker } from "../workers/workerClient";
import { getAudioContext } from "../audio/decode";
import { mixToMono, snapToAttack, type SongAnalysis } from "../audio/song/beats";
import { framesPerBar, planSections, SECTION_BARS, sectionSeconds } from "../audio/song/chop";
import { NOTE_NAMES } from "../audio/theory";
import type { Pad } from "./PadPanel";

export interface ChopSettings {
  bpm: number;
  beatsPerBar: number;
  /** Frame of bar 1 beat 1. */
  downbeatFrame: number;
  /** The key to tune the project to, or null to leave the project's key alone. */
  keyPc: number | null;
}

const MIN_BPM = 30;
const MAX_BPM = 300;
/** Seconds the zoomed views show: wide to find the transient, fine to put the line on its first sample. */
const WINDOWS = { wide: 2, fine: 0.25 } as const;

function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  return `${sign}${m}:${(abs - m * 60).toFixed(3).padStart(6, "0")}`;
}

/** Every bar and beat line of the grid that falls in a window, as frames. */
function gridLines(startFrame: number, endFrame: number, bpm: number, beatsPerBar: number, sampleRate: number, origin: number) {
  const beat = (60 * sampleRate) / bpm;
  const lines: { frame: number; bar: boolean }[] = [];
  for (let n = Math.ceil((startFrame - origin) / beat); origin + n * beat <= endFrame; n++) {
    lines.push({ frame: origin + n * beat, bar: ((n % beatsPerBar) + beatsPerBar) % beatsPerBar === 0 });
  }
  return lines;
}

/** A zoomed look at one bar line: the waveform with the beat grid over it. Dragging the waveform moves the grid. */
function GridView({
  channelData,
  sampleRate,
  barFrame,
  bpm,
  beatsPerBar,
  windowSeconds,
  onDrag,
  label,
}: {
  channelData: Float32Array[];
  sampleRate: number;
  /** The frame of the bar line this view is centred on (a quarter of the way in from the left). */
  barFrame: number;
  bpm: number;
  beatsPerBar: number;
  windowSeconds: number;
  /** The grid should move by this many seconds (drag the waveform until the sound sits on the line). */
  onDrag: (seconds: number) => void;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number } | null>(null);
  const windowFrames = windowSeconds * sampleRate;
  const startFrame = barFrame - windowFrames * 0.25;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(el.clientWidth * ratio));
    const h = Math.max(1, Math.round(el.clientHeight * ratio));
    el.width = w;
    el.height = h;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const style = getComputedStyle(el);
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2;
    // The loudest sample of every channel in each pixel column.
    const perPixel = windowFrames / w;
    const peaks = new Float32Array(w);
    let top = 0;
    for (let x = 0; x < w; x++) {
      const from = Math.max(0, Math.floor(startFrame + x * perPixel));
      const to = Math.min(channelData[0].length, Math.max(from + 1, Math.floor(startFrame + (x + 1) * perPixel)));
      let peak = 0;
      for (const data of channelData) for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(data[i]));
      peaks[x] = peak;
      top = Math.max(top, peak);
    }
    ctx.fillStyle = style.color;
    const scale = top > 0 ? (mid * 0.9) / top : 0;
    for (let x = 0; x < w; x++) ctx.fillRect(x, mid - peaks[x] * scale, 1, Math.max(1, peaks[x] * scale * 2));
    for (const line of gridLines(startFrame, startFrame + windowFrames, bpm, beatsPerBar, sampleRate, barFrame)) {
      const x = Math.round(((line.frame - startFrame) / windowFrames) * w);
      ctx.fillStyle = line.bar ? style.getPropertyValue("--accent") || "#f0a" : "rgba(255,255,255,0.45)";
      ctx.fillRect(x, 0, Math.max(1, Math.round(ratio * (line.bar ? 2 : 1))), h);
    }
  }, [channelData, sampleRate, barFrame, bpm, beatsPerBar, windowFrames, startFrame]);

  return (
    <div className="chop-view">
      <div className="chop-view__label">{label}</div>
      <canvas
        ref={canvas}
        className="chop-view__canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x: e.clientX };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const seconds = ((d.x - e.clientX) / e.currentTarget.clientWidth) * windowSeconds;
          d.x = e.clientX;
          onDrag(seconds);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
    </div>
  );
}

/**
 * Sets up chopping a song into 8-bar sections: the tempo, bar 1 and key are found from the audio and shown as suggestions the
 * user checks against the waveform. Two zoomed views (bar 1 and the last section) show the beat grid on the sound, and a click
 * track plays over the audio to hear it. Nothing is cut until Chop is pressed, because the cuts are rendered into files.
 */
export function SongChopModal({
  pad,
  beatsPerBar: projectBeatsPerBar,
  freeSlots,
  onConfirm,
  onClose,
}: {
  pad: Pad;
  /** The project's time signature numerator. */
  beatsPerBar: number;
  freeSlots: number;
  onConfirm: (settings: ChopSettings) => void;
  onClose: () => void;
}) {
  const sampleRate = pad.sampleRate;
  const totalFrames = pad.channelData[0].length;
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  const [status, setStatus] = useState<"listening" | "done" | "failed">("listening");
  const [bpm, setBpm] = useState(120);
  const [bpmText, setBpmText] = useState("120");
  const [beatsPerBar, setBeatsPerBar] = useState(projectBeatsPerBar);
  const [downbeatFrame, setDownbeatFrame] = useState(0);
  const [zoom, setZoom] = useState<keyof typeof WINDOWS>("wide");
  const [keyPc, setKeyPc] = useState(0);
  const [minor, setMinor] = useState(false);
  const [useKey, setUseKey] = useState(true);
  const [playing, setPlaying] = useState(false);
  const stopPlaying = useRef<(() => void) | null>(null);

  const applyBpm = useCallback((value: number) => {
    const next = Math.min(MAX_BPM, Math.max(MIN_BPM, value));
    setBpm(next);
    setBpmText(String(Math.round(next * 1000) / 1000));
  }, []);

  useEffect(() => {
    let alive = true;
    const mono = mixToMono(pad.channelData);
    nextAnalysisWorker()
      .analyzeSong(Comlink.transfer(mono, [mono.buffer]), sampleRate, projectBeatsPerBar)
      .then((result) => {
        if (!alive) return;
        if (!result) return setStatus("failed");
        setAnalysis(result);
        applyBpm(result.bpm);
        setDownbeatFrame(Math.round(result.downbeatSeconds * sampleRate));
        setKeyPc(result.key.pc);
        setMinor(result.key.minor);
        setStatus("done");
      })
      .catch(() => alive && setStatus("failed"));
    return () => {
      alive = false;
    };
    // the analysis runs once, for the song as it was opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopPlaying.current?.(), []);

  const grid = useMemo(() => ({ bpm, beatsPerBar, downbeatFrame, sampleRate }), [bpm, beatsPerBar, downbeatFrame, sampleRate]);
  const plans = useMemo(() => planSections(totalFrames, grid), [totalFrames, grid]);
  const last = plans.length - 1;
  const fits = Math.min(plans.length, freeSlots);

  /** Plays the song from a bar line with a click on every beat (higher on the bar's first), so the grid can be heard against the music. */
  const playFrom = (startFrame: number) => {
    stopPlaying.current?.();
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const beat = 60 / bpm;
    const bars = 2;
    const seconds = bars * beatsPerBar * beat + 0.3;
    const frames = Math.round(seconds * sampleRate);
    const buffer = ctx.createBuffer(pad.channelData.length, frames, sampleRate);
    pad.channelData.forEach((data, ch) => {
      const from = Math.max(0, startFrame);
      const slice = data.subarray(from, Math.min(data.length, startFrame + frames));
      buffer.copyToChannel(slice as Float32Array<ArrayBuffer>, ch, Math.max(0, -startFrame));
    });
    const t0 = ctx.currentTime + 0.05;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(t0);
    const clicks: OscillatorNode[] = [];
    for (let i = 0; i < bars * beatsPerBar; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i % beatsPerBar === 0 ? 1600 : 1000;
      gain.gain.setValueAtTime(0.25, t0 + i * beat);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * beat + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * beat);
      osc.stop(t0 + i * beat + 0.05);
      clicks.push(osc);
    }
    setPlaying(true);
    const done = () => {
      stopPlaying.current = null;
      setPlaying(false);
    };
    source.onended = done;
    stopPlaying.current = () => {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
      for (const osc of clicks) {
        try {
          osc.stop();
        } catch {
          /* already ended */
        }
      }
      done();
    };
  };

  const nudge = (frames: number) => setDownbeatFrame((d) => Math.round(d + frames));
  const nudgeMs = (ms: number) => nudge(Math.round((ms * sampleRate) / 1000));
  const beatFrames = (60 * sampleRate) / bpm;

  /** Moves bar 1 onto the sharpest rise in loudness within 30 ms. */
  const snap = () => {
    const radius = Math.round(0.03 * sampleRate);
    const from = Math.max(0, downbeatFrame - radius - 16);
    const to = Math.min(totalFrames, downbeatFrame + radius + 16);
    const slice = mixToMono(pad.channelData.map((d) => d.subarray(from, to)));
    const at = snapToAttack(slice, downbeatFrame - from, radius);
    setDownbeatFrame(from + at);
  };

  const sectionStart = (k: number) => plans[Math.max(0, Math.min(last, k))]?.start ?? downbeatFrame;
  /** Dragging the end view moves the last section's cut; with bar 1 fixed that means a different tempo. */
  const dragEnd = (seconds: number) => {
    if (last < 1) return nudge(seconds * sampleRate);
    const section = framesPerBar(grid) * SECTION_BARS;
    const wanted = section + (seconds * sampleRate) / last;
    if (wanted > 0) applyBpm(((SECTION_BARS * beatsPerBar * 60 * sampleRate) / wanted));
  };

  const confidenceNote = !analysis
    ? null
    : Math.min(analysis.confidence.tempo, analysis.confidence.grid) < 0.4
      ? "The tempo is uncertain: check the grid sits on the beats at both ends."
      : analysis.confidence.downbeat < 0.4
        ? "Which beat is beat 1 is a guess: check bar 1 against the music."
        : null;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-modal chop" role="dialog" aria-label="Chop song to patterns" onClick={(e) => e.stopPropagation()}>
        <div className="palette-modal__head">
          <strong>Chop to patterns</strong>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="palette-modal__key">
          {status === "listening" && "Listening for the tempo, bar 1 and key…"}
          {status === "failed" && "No steady beat found. Set the tempo and bar 1 by hand."}
          {status === "done" && (confidenceNote ?? "Found them. Check the grid sits on the beats, then chop.")}
        </div>

        <div className="palette-modal__list chop__body">
          <div className="chop__row">
            <label>
              Tempo
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={MIN_BPM}
                max={MAX_BPM}
                value={bpmText}
                onChange={(e) => {
                  setBpmText(e.target.value);
                  const value = parseFloat(e.target.value);
                  if (Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM) setBpm(value);
                }}
                onBlur={() => setBpmText(String(Math.round(bpm * 1000) / 1000))}
              />
            </label>
            <button className="menu__button" onClick={() => applyBpm(bpm / 2)}>
              ÷2
            </button>
            <button className="menu__button" onClick={() => applyBpm(bpm * 2)}>
              ×2
            </button>
            <label>
              Beats per bar
              <input type="number" min={1} max={16} step={1} value={beatsPerBar} onChange={(e) => setBeatsPerBar(Math.min(16, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
            </label>
          </div>

          <GridView
            label={`Bar 1 at ${formatTime(downbeatFrame / sampleRate)}. Drag the waveform until the sound sits on the line`}
            channelData={pad.channelData}
            sampleRate={sampleRate}
            barFrame={downbeatFrame}
            bpm={bpm}
            beatsPerBar={beatsPerBar}
            windowSeconds={WINDOWS[zoom]}
            onDrag={(seconds) => nudge(seconds * sampleRate)}
          />
          <div className="chop__row">
            <button className="menu__button" onClick={() => nudgeMs(-10)}>
              -10 ms
            </button>
            <button className="menu__button" onClick={() => nudge(-1)}>
              -1
            </button>
            <button className="menu__button" onClick={() => nudge(1)}>
              +1
            </button>
            <button className="menu__button" onClick={() => nudgeMs(10)}>
              +10 ms
            </button>
            <button className="menu__button" onClick={snap}>
              Snap
            </button>
          </div>
          <div className="chop__row">
            <button className="menu__button" onClick={() => nudge(-beatFrames)}>
              -1 beat
            </button>
            <button className="menu__button" onClick={() => nudge(beatFrames)}>
              +1 beat
            </button>
            <button className="menu__button" onClick={() => setZoom((z) => (z === "wide" ? "fine" : "wide"))}>
              Zoom: {zoom === "wide" ? "wide" : "fine"}
            </button>
            <button className="menu__button" onClick={() => (playing ? stopPlaying.current?.() : playFrom(sectionStart(0)))}>
              {playing ? "Stop" : "Play with clicks"}
            </button>
          </div>

          {last >= 1 && (
            <>
              <GridView
                label={`Section ${last + 1} starts at ${formatTime(sectionStart(last) / sampleRate)}. Drag to adjust the tempo until it lines up too`}
                channelData={pad.channelData}
                sampleRate={sampleRate}
                barFrame={sectionStart(last)}
                bpm={bpm}
                beatsPerBar={beatsPerBar}
                windowSeconds={WINDOWS[zoom]}
                onDrag={dragEnd}
              />
              <div className="chop__row">
                <button className="menu__button" onClick={() => applyBpm(bpm - 0.01)}>
                  Tempo -0.01
                </button>
                <button className="menu__button" onClick={() => applyBpm(bpm + 0.01)}>
                  Tempo +0.01
                </button>
                <button className="menu__button" onClick={() => (playing ? stopPlaying.current?.() : playFrom(sectionStart(last)))}>
                  {playing ? "Stop" : "Play end"}
                </button>
              </div>
            </>
          )}

          <div className="chop__row">
            <label className="chop__check">
              <input type="checkbox" checked={useKey} onChange={(e) => setUseKey(e.target.checked)} />
              Tune the project to the song's key
            </label>
          </div>
          <div className="chop__row">
            <select className="menu__select" value={keyPc} onChange={(e) => setKeyPc(Number(e.target.value))} aria-label="Key">
              {NOTE_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select className="menu__select" value={minor ? "minor" : "major"} onChange={(e) => setMinor(e.target.value === "minor")} aria-label="Major or minor">
              <option value="major">major</option>
              <option value="minor">minor</option>
            </select>
          </div>

          <div className="palette-modal__key">
            {plans.length} section{plans.length === 1 ? "" : "s"} of {SECTION_BARS} bars ({sectionSeconds(bpm, beatsPerBar).toFixed(2)} s each).
            {plans.length > 0 && plans[plans.length - 1].audioFrames < plans[plans.length - 1].length ? " The last one is padded with silence to a full 8 bars." : ""}
            {plans.length > fits ? ` Only ${fits} fit on free pads: the last ${plans.length - fits} are dropped.` : ""} The song's own pad is replaced by the sections, and the project tempo becomes {bpm.toFixed(2)} BPM.
          </div>
        </div>

        <button
          className="menu__button menu__button--primary"
          disabled={status === "listening" || plans.length === 0 || fits === 0}
          onClick={() => {
            stopPlaying.current?.();
            onConfirm({ bpm, beatsPerBar, downbeatFrame, keyPc: useKey ? keyPc : null });
          }}
        >
          Chop into {fits} pattern{fits === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
