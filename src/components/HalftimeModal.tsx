import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeNative, getAudioContext, monoFromChannelData } from "../audio/decode";
import { isKoalaFile } from "../audio/koalaProject";
import { detectSongTempo } from "../audio/song/detectors";
import { baseGrid } from "../audio/song/chopMarks";
import { buildPyramid } from "../audio/song/waveform";
import { DEFAULT_RESYNC_STEPS, type HalftimeSettings } from "../audio/halftime/timing";
import { renderHalftime, startHalftime } from "../audio/halftime/playback";
import { ChopTimeline, type ChopTimelineHandle } from "./ChopTimeline";
import { Knob } from "./Knob";
import type { Pad } from "./PadPanel";
import "./halftime.css";
const STEP_LENGTHS = [{ label: "1/32", beats: 0.125 }, { label: "1/16", beats: 0.25 }, { label: "1/8", beats: 0.5 }, { label: "1/4", beats: 1 }, { label: "1/2", beats: 2 }, { label: "1/16 T", beats: 1 / 6 }, { label: "1/8 T", beats: 1 / 3 }, { label: "1/4 T", beats: 2 / 3 }];
export interface HalftimeBounce { channelData: Float32Array[]; sampleRate: number; bpm: number; name: string; }
export function HalftimeModal({ initialPad, initialBpm, beatsPerBar = 4, onClose, onImportProject, onBounce }: {
  initialPad: Pad | null; initialBpm: number; beatsPerBar?: number; onClose: () => void;
  onImportProject: (file: File) => Promise<void>; onBounce: (bounce: HalftimeBounce) => Promise<void>;
}) {
  const [source, setSource] = useState<Pad | null>(initialPad);
  const [bpm, setBpm] = useState(initialPad?.bpm ?? initialBpm);
  const [anchor, setAnchor] = useState(0);
  const [speed, setSpeed] = useState(0.5), [mix, setMix] = useState(1);
  const [rhythm, setRhythm] = useState(false), [steps, setSteps] = useState<boolean[]>(DEFAULT_RESYNC_STEPS.slice());
  const [stepBeats, setStepBeats] = useState(beatsPerBar / 16);
  const [playing, setPlaying] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [currentStep, setCurrentStep] = useState(-1);
  const fileInput = useRef<HTMLInputElement>(null), timeline = useRef<ChopTimelineHandle>(null);
  const voice = useRef<ReturnType<typeof startHalftime> | null>(null);
  const revision = useRef(0), alive = useRef(true);
  const cleanup = useRef(() => { alive.current = false; revision.current++; voice.current?.stop(); });
  const buffer = useMemo(() => {
    if (!source) return null;
    const out = getAudioContext().createBuffer(source.channelData.length, source.channelData[0].length, source.sampleRate);
    source.channelData.forEach((ch, i) => out.getChannelData(i).set(ch));
    return out;
  }, [source]);
  const pyramid = useMemo(() => source ? buildPyramid(source.channelData) : null, [source]);
  const grid = useMemo(() => source ? baseGrid(source.sampleRate, beatsPerBar, bpm, anchor) : null, [source, bpm, anchor, beatsPerBar]);
  const playbackSettings = useMemo<HalftimeSettings>(() => ({ bpm, anchorSeconds: anchor, speed, mix: 1, rhythm, stepBeats, steps }), [bpm, anchor, speed, rhythm, stepBeats, steps]);
  const settings = { ...playbackSettings, mix };
  const mixRef = useRef(mix); mixRef.current = mix;
  const stop = useCallback(() => { voice.current?.stop(); voice.current = null; setPlaying(false); setCurrentStep(-1); }, []);
  useEffect(() => { alive.current = true; const close = cleanup.current; return close; }, []);
  useEffect(() => {
    const old = voice.current;
    if (!old || !buffer) return;
    const at = old.position(); old.stop();
    voice.current = startHalftime(getAudioContext(), buffer, { ...playbackSettings, mix: mixRef.current }, at);
  }, [playbackSettings, buffer]);
  useEffect(() => { voice.current?.setMix(mix); }, [mix]);
  useEffect(() => {
    if (!playing || !source || !buffer) return;
    let raf = 0;
    const tick = () => {
      const at = voice.current?.position() ?? 0;
      timeline.current?.setCursor(at * source.sampleRate);
      const n = Math.floor((at - anchor) / (60 / bpm * stepBeats));
      setCurrentStep(((n % 16) + 16) % 16);
      if (at >= buffer.duration) { stop(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, source, buffer, anchor, bpm, stepBeats, stop]);
  useEffect(() => {
    const pause = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [stop]);
  const analyze = async (pad: Pad, at: number | null) => {
    const token = ++revision.current;
    setStatus("Finding BPM…");
    try {
      const found = await detectSongTempo(monoFromChannelData(pad.channelData), pad.sampleRate, at === null ? null : at * pad.sampleRate);
      if (!alive.current || token !== revision.current) return;
      setBpm(found.bpm); setAnchor(at ?? found.downbeatSeconds); setStatus("");
    } catch {
      if (alive.current && token === revision.current) setStatus("No beat found. Set BPM and Anchor by ear.");
    }
  };
  useEffect(() => {
    if (!initialPad) return;
    let active = true;
    const token = ++revision.current;
    setStatus("Finding BPM…");
    detectSongTempo(monoFromChannelData(initialPad.channelData), initialPad.sampleRate)
      .then(found => { if (active && token === revision.current) { setBpm(found.bpm); setAnchor(found.downbeatSeconds); setStatus(""); } })
      .catch(() => { if (active && token === revision.current) setStatus("Set BPM and Anchor by ear."); });
    return () => { active = false; };
  }, [initialPad]);
  const load = async (file: File) => {
    stop(); setBusy(true); revision.current++;
    try {
      if (isKoalaFile(file)) { await onImportProject(file); return; }
      const decoded = await decodeNative(file);
      if (!alive.current) return;
      const pad: Pad = { ...decoded, index: -1, origIndex: -1, sampleId: -1, name: file.name.replace(/\.[^.]+$/, ""), tune: false, semis: 0, cents: 0 };
      setSource(pad); setAnchor(0); setStatus("");
      void analyze(pad, null);
    } catch { if (alive.current) setStatus("This file could not be opened."); }
    finally { if (alive.current) setBusy(false); }
  };
  const play = async () => {
    if (playing) return stop();
    if (!buffer) return;
    const ctx = getAudioContext(); await ctx.resume();
    const at = (timeline.current?.cursor() ?? 0) / buffer.sampleRate;
    voice.current = startHalftime(ctx, buffer, settings, at >= buffer.duration ? 0 : at);
    setPlaying(true);
  };
  const bounce = async () => {
    if (!buffer || !source) return;
    stop(); setBusy(true); setStatus("Bouncing Halftime…");
    try {
      const result = await renderHalftime(buffer, settings);
      if (!alive.current) return;
      await onBounce({ channelData: Array.from({ length: result.numberOfChannels }, (_, i) => result.getChannelData(i).slice()), sampleRate: result.sampleRate, bpm, name: source.label ?? source.name });
    } catch (error) { if (alive.current) setStatus(error instanceof Error ? error.message : "Bounce failed. Source kept."); }
    finally { if (alive.current) setBusy(false); }
  };
  const bars = buffer ? buffer.duration * bpm / 60 / beatsPerBar : 0;
  return <div className="palette-backdrop halftime-backdrop"><section className="halftime" role="dialog" aria-modal="true" aria-label="Halftime">
    <header className="chop__head"><strong>Halftime <span className="chop__version">v{__APP_VERSION__}</span></strong><button aria-label="Close Halftime" disabled={busy} onClick={() => { stop(); onClose(); }}>×</button></header>
    <input ref={fileInput} type="file" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void load(file); }} />
    <button className="chop__btn halftime__load" disabled={busy} onClick={() => fileInput.current?.click()}>{source ? source.label ?? source.name : "Import audio or Koala project"}</button>
    {source && pyramid ? <div className="halftime__screen"><ChopTimeline key={source.name} ref={timeline} pyramid={pyramid} sampleRate={source.sampleRate} grid={grid} chops={[]} downbeats={[]} oneOne={anchor * source.sampleRate} sections={[]} magnetOn={false} fine onScrub={stop} onScrubEnd={() => false} /></div> : <div className="halftime__empty"><span className="halftime__half">½</span><p>Slow the sound.<br/>Keep the song moving.</p><small>Import audio, or open a Koala project<br/>and drag a pad onto Halftime.</small></div>}
    <div className="halftime__alignment"><label>BPM <input aria-label="Halftime BPM" type="number" min="20" max="300" step="0.01" value={+bpm.toFixed(2)} disabled={busy} onChange={e => { const v = Number(e.target.value); if (v >= 20 && v <= 300) { revision.current++; setStatus(""); setBpm(v); } }} /></label><button className="chop__btn" disabled={!source || busy} onClick={() => { if (source) { const at = (timeline.current?.cursor() ?? 0) / source.sampleRate; setAnchor(at); void analyze(source, at); } }}>Anchor</button><span>{bars > 0 ? `${+bars.toFixed(2)} bars` : ""}</span></div>
    <div className="halftime__knobs"><div><Knob label="Speed" value={(speed - 0.25) / 0.75} onChange={v => setSpeed(+(0.25 + v * 0.75).toFixed(3))} /><output>{Math.round(speed * 100)}% <small>{+(12 * Math.log2(speed)).toFixed(1)} st</small></output></div><div><Knob label="Mix" value={mix} onChange={setMix} /><output>{Math.round(mix * 100)}%</output></div></div>
    <div className="halftime__presets">{[{ label: "¼", speed: 0.25 }, { label: "⅓", speed: 1 / 3 }, { label: "½", speed: 0.5 }, { label: "⅔", speed: 2 / 3 }].map(p => <button key={p.label} className={`chop__btn${Math.abs(speed - p.speed) < 0.001 ? " halftime__on" : ""}`} aria-pressed={Math.abs(speed - p.speed) < 0.001} onClick={() => setSpeed(p.speed)}>{p.label}</button>)}</div>
    <button className={`chop__btn halftime__rhythm${rhythm ? " halftime__on" : ""}`} aria-pressed={rhythm} onClick={() => setRhythm(r => !r)}>Rhythm <span>{rhythm ? "On" : "Off · half-note resync"}</span></button>
    {rhythm ? <div className="halftime__pattern"><div className="halftime__lengths"><label>Period <select aria-label="Halftime pattern period" value="" onChange={e => setStepBeats(Number(e.target.value) * beatsPerBar / 16)}><option value="" disabled>{+(16 * stepBeats / beatsPerBar).toFixed(2)} bars</option>{[1, 2, 4, 8].map(n => <option value={n} key={n}>{n} bar{n === 1 ? "" : "s"}</option>)}</select></label><label>Step <select aria-label="Halftime step length" value={stepBeats} onChange={e => setStepBeats(Number(e.target.value))}>{!STEP_LENGTHS.some(s => s.beats === stepBeats) ? <option value={stepBeats}>Custom</option> : null}{STEP_LENGTHS.map(s => <option key={s.label} value={s.beats}>{s.label}</option>)}</select></label></div><div className="halftime__steps">{steps.map((on, i) => <button key={i} aria-label={`Resync step ${i + 1}`} aria-pressed={on} className={`halftime__step${on ? " halftime__step--on" : ""}${currentStep === i ? " halftime__step--playing" : ""}`} onClick={() => setSteps(previous => previous.map((v, n) => n === i ? !v : v))}>{i + 1}</button>)}</div><small>Lit steps resync. Empty steps keep slowing.</small></div> : null}
    <p className="halftime__status" role="status">{status || "The pattern repeats. The song continues."}</p>
    <div className="halftime__transport"><button className="chop__btn" disabled={!source || busy} aria-label={playing ? "Pause Halftime" : "Play Halftime"} aria-pressed={playing} onClick={() => void play()}>{playing ? "❚❚ Pause" : "▶ Play"}</button><button className="chop__go" disabled={!source || busy} onClick={() => void bounce()}>{busy ? "Working…" : "Bounce to loop pad"}</button></div>
  </section></div>;
}
