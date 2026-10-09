import { useEffect, useRef, useState } from "react";
import { createKeyboardPlayer, DEFAULT_KEYBOARD_OPTIONS, type KeyboardOptions } from "../../audio/seq/keyboard";
import { DEFAULT_MASTER_CLIPPER, DEFAULT_PAD_FILTERS, type PadFilters, createMasterClipper } from "../../audio/seq/effects";
import { playSeqSound, prepareSeqSounds, clearSeqBuffers, setSeqBufferLimit, seqBufferUsage, type SeqSound } from "../../audio/seq/engine";
import { getAudioContext } from "../../audio/decode";
import { startNoteRepeat } from "../../audio/seq/repeat";
import { LiveRepeatControls } from "./LiveRepeatControls";
import { Waveform } from "../Waveform";
import type { SeqPad } from "./SeqScreen";
import { KeyboardControls } from "./KeyboardControls";
import { LiveKeybed } from "./LiveKeybed";
import "./seq.css";
import "./liveSeq.css";

export function LiveSeqScreen({ bpm, padsOfBank, soundFor, filtersFor, onFiltersChange, onBack }: { bpm: number; padsOfBank: (bank: number) => (SeqPad | null)[]; soundFor: (pad: number, keyboard: boolean) => SeqSound | null; filtersFor: (pad: number) => PadFilters; onFiltersChange: (pad: number, filters: PadFilters) => void; onBack: () => void }) {
  const [memoryLimit, setMemoryLimit] = useState(128);
  const [prepared, setPrepared] = useState({ bytes: 0, ms: 0 });
  const [preparing, setPreparing] = useState(true);
  const [bank, setBank] = useState(0), [selected, setSelected] = useState(0);
  const [page, setPage] = useState<"pads" | "keys" | "sample" | "repeat" | "setup">("pads");
  const [lastNote, setLastNote] = useState(0);
  const keyboardMode = useRef(false);
  const [repeatValues, setRepeatValues] = useState({ velocity: 100, rate: 4 });
  const repeatSettings = useRef(repeatValues); repeatSettings.current = repeatValues;
  const repeatPointers = useRef(new Map<number, number>());
  const gridOrigin = useRef<number | null>(null);
  const repeating = useRef<{ handle: ReturnType<typeof startNoteRepeat> } | null>(null);
  const repeatTails = useRef<(() => void)[]>([]);
  const [octave, setOctave] = useState(0);
  const [settings, setSettings] = useState<Record<number, KeyboardOptions>>({});
  const [, setPressed] = useState<Set<number>>(new Set());
  const current = bank * 16 + selected, pads = padsOfBank(bank);
  const optionsFor = (index: number) => settings[index] ?? { ...DEFAULT_KEYBOARD_OPTIONS, oneShot: padsOfBank(Math.floor(index / 16))[index % 16]?.oneShot ?? false };
  const values = optionsFor(current);
  const filters = filtersFor(current) ?? DEFAULT_PAD_FILTERS;
  const [clipper, setClipper] = useState(DEFAULT_MASTER_CLIPPER);
  const live = useRef({ soundFor, current, values }); live.current = { soundFor, current, values };
  const master = useRef<ReturnType<typeof createMasterClipper> | null>(null);
  const allVoices = useRef(new Set<ReturnType<typeof playSeqSound>>());
  const heldPads = useRef(new Map<number, ReturnType<typeof playSeqSound>>());
  const keyboard = useRef<ReturnType<typeof createKeyboardPlayer> | null>(null);
  const destination = () => { if (!master.current) { const ctx = getAudioContext(); master.current = createMasterClipper(ctx, ctx.destination); } return master.current.input; };
  if (!keyboard.current) keyboard.current = createKeyboardPlayer((pitch, velocity, attack) => {
    const sound = live.current.soundFor(live.current.current, true);
    if (!sound) return { release() {}, cut() {}, glide() {} };
    return playSeqSound(sound, pitch, velocity, undefined, undefined, destination(), attack);
  }, () => live.current.values);
  const stop = () => { repeating.current?.handle.stop(true); repeating.current = null; repeatPointers.current.clear(); repeatTails.current.forEach(cut => cut()); repeatTails.current = []; keyboard.current?.stop(); allVoices.current.forEach(voice => voice.cut()); allVoices.current.clear(); heldPads.current.clear(); setPressed(new Set()); };
  useEffect(() => {
    const keyboardPlayer = keyboard.current;
    const voices = allVoices.current;
    const blur = () => { repeating.current?.handle.stop(true); repeating.current = null; repeatPointers.current.clear(); repeatTails.current.forEach(cut => cut()); repeatTails.current = []; keyboardPlayer?.stop(); voices.forEach(voice => voice.cut()); voices.clear(); heldPads.current.clear(); setPressed(new Set()); };
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("blur", blur); repeating.current?.handle.stop(true); repeatTails.current.forEach(cut => cut()); keyboardPlayer?.stop(); voices.forEach(voice => voice.cut()); const bus = master.current; window.setTimeout(() => bus?.disconnect(), 6); clearSeqBuffers(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPreparing(true);
    if (!master.current) { const ctx = getAudioContext(); master.current = createMasterClipper(ctx, ctx.destination); }
    gridOrigin.current ??= getAudioContext().currentTime;
    setSeqBufferLimit(memoryLimit * 1024 * 1024);
    const began = performance.now();
    const indices = [live.current.current, ...Array.from({ length: 16 }, (_, slot) => bank * 16 + slot)];
    const sounds = [...new Set(indices)].flatMap(index => { const sound = live.current.soundFor(index, false); return sound ? [sound] : []; });
    void prepareSeqSounds(sounds, memoryLimit * 1024 * 1024, () => cancelled).then(() => { if (!cancelled) { setPreparing(false); setPrepared({ bytes: seqBufferUsage(), ms: performance.now() - began }); } }).catch(() => { if (!cancelled) setPreparing(false); });
    return () => { cancelled = true; };
  }, [bank, memoryLimit]);
  const changePage = (next: typeof page) => { stop(); if (next === "keys") keyboardMode.current = true; else if (next === "pads") keyboardMode.current = false; setPage(next); };
  const playPad = (index: number, pointer: number) => {
    const sound = soundFor(index, false); if (!sound) return;
    const options = optionsFor(index);
    if (options.mono) heldPads.current.forEach(voice => voice.cut());
    const voice = playSeqSound(sound, 0, 127, undefined, undefined, destination(), options.attackSeconds);
    heldPads.current.set(pointer, voice); allVoices.current.add(voice);
    if (allVoices.current.size > 64) { const oldest = allVoices.current.values().next().value!; oldest.cut(); allVoices.current.delete(oldest); }
    setSelected(index % 16); setPressed(previous => new Set([...previous, pointer]));
  };
  const releasePad = (pointer: number, index: number) => {
    const voice = heldPads.current.get(pointer); if (!voice) return;
    if (!(optionsFor(index)).oneShot) voice.release((optionsFor(index)).decaySeconds);
    heldPads.current.delete(pointer); setPressed(previous => { const next = new Set(previous); next.delete(pointer); return next; });
  };
  const panelPlay = (pointer: number, kind: "velocity" | "rate") => {
    if (preparing) return;
    const sound = live.current.soundFor(current, keyboardMode.current); if (!sound) return;
    const pitched = { ...sound, pitch: sound.pitch + (keyboardMode.current ? lastNote : 0) };
    if (kind === "velocity") {
      if (values.mono) allVoices.current.forEach(voice => voice.cut());
      const voice = playSeqSound(pitched, 0, repeatSettings.current.velocity, undefined, undefined, destination(), values.attackSeconds);
      heldPads.current.set(pointer, voice); allVoices.current.add(voice);
      for (const candidate of allVoices.current) if (candidate.isEnded()) allVoices.current.delete(candidate);
      if (allVoices.current.size > 64) { const oldest = allVoices.current.values().next().value!; oldest.cut(); allVoices.current.delete(oldest); }
    } else {
      repeatPointers.current.set(pointer, repeatSettings.current.rate);
      if (!repeating.current) repeating.current = { handle: startNoteRepeat(() => pitched, () => ({ ...live.current.values, ...repeatSettings.current, bpm }), destination(), gridOrigin.current ?? 0) };
      repeating.current.handle.updateRates([...repeatPointers.current.values()]);
    }
  };
  const panelRelease = (pointer: number) => {
    if (repeatPointers.current.delete(pointer)) {
      const remaining = [...repeatPointers.current.values()];
      repeating.current?.handle.updateRates(remaining);
      if (remaining.length) { repeatSettings.current = { ...repeatSettings.current, rate: remaining.at(-1)! }; setRepeatValues(repeatSettings.current); }
    }
    releasePad(pointer, current);
  };
  return <div className="seq live-seq">
    <div className={`live-seq__transport${page === "sample" ? " live-seq__transport--edit" : ""}`}>
      <button onClick={() => { stop(); onBack(); }}>Back</button>{page === "sample" ? <button aria-current="page">Edit</button> : <><button disabled>{bpm}</button><button onClick={stop}>Stop</button><button disabled aria-label="Recording comes after latency testing">●</button><button onClick={() => changePage("setup")}>Mixer</button></>}
    </div>
    {page !== "sample" && <div className="live-seq__scenes" aria-label="Live playback status">
      <div className="live-seq__scene"><header>Live playback</header>{[0, 1, 2, 3].map(b => <div key={b} style={{ background: `var(--b${"ABCD"[b]})`, opacity: b === bank ? 1 : 0.4 }}>{"ABCD"[b]}</div>)}</div>
      <small role="status">{preparing ? "Preparing samples…" : `${"ABCD"[bank]}${selected + 1} · ${pads[selected]?.label ?? "Select a sample"}`}</small>
    </div>}
    <div className={`live-seq__body${page === "keys" ? " live-seq__body--keys" : ""}`}>
      {page === "pads" && <div className="live-seq__pads">{pads.map((pad, slot) => <button key={slot} className={`pad${pad ? " pad--loaded" : ""} live-seq__pad${selected === slot ? " is-selected" : ""}`} disabled={!pad || preparing} style={{ ["--c" as string]: pad?.color }} aria-label={`Pad ${slot + 1}${pad ? `, ${pad.label}` : ", empty"}`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); playPad(bank * 16 + slot, event.pointerId); }} onPointerUp={event => releasePad(event.pointerId, bank * 16 + slot)} onPointerCancel={event => releasePad(event.pointerId, bank * 16 + slot)} onLostPointerCapture={event => releasePad(event.pointerId, bank * 16 + slot)}>{pad?.label}</button>)}</div>}
      {page === "keys" && <><div className="live-seq__octave"><button onClick={() => { stop(); setOctave(n => Math.max(-2, n - 1)); }}>‹</button><span>C{octave + 2}</span><button onClick={() => { stop(); setOctave(n => Math.min(3, n + 1)); }}>›</button></div><LiveKeybed key={`${current}:${octave}`} octave={octave} onDown={(pointer, pitch) => { if (!preparing) { keyboard.current!.down(pointer, pitch, 127); setLastNote(pitch); } }} onUp={pointer => keyboard.current!.up(pointer)} /></>}
      {page === "repeat" && <LiveRepeatControls velocity={repeatValues.velocity} rate={repeatValues.rate} heldRates={[...repeatPointers.current.values()]} onChange={(kind, value, pointer) => { if (kind === "rate" && pointer !== undefined && repeatPointers.current.has(pointer)) { repeatPointers.current.set(pointer, value); repeating.current?.handle.updateRates([...repeatPointers.current.values()]); } repeatSettings.current = { ...repeatSettings.current, [kind]: value }; setRepeatValues(repeatSettings.current); }} onPlay={panelPlay} onRelease={panelRelease} />}
      {page === "sample" && <div className="live-seq__controls">
        <div className="live-seq__wave-card"><header>{pads[selected]?.label ?? "Select a sample"}</header>{soundFor(current, false) && <Waveform channelData={soundFor(current, false)!.channelData} />}</div>
        <KeyboardControls value={values} onChange={next => { stop(); setSettings(previous => ({ ...previous, [current]: next })); }} />
        <section className="live-seq__filters" aria-label="Pad Butterworth filters">{(["highPassHz", "lowPassHz"] as const).map(key => <label key={key}><span>{key === "highPassHz" ? "High pass" : "Low pass"}<small>{filters[key] > 0 ? `${Math.round(filters[key])} Hz · 48 dB/oct` : "Off"}</small></span><input aria-label={key === "highPassHz" ? "High pass cutoff" : "Low pass cutoff"} type="range" min={0} max={1} step={0.001} value={filters[key] > 0 ? Math.log(filters[key] / 20) / Math.log(1000) : 0} onChange={event => { const value = Number(event.target.value); onFiltersChange(current, { ...filters, order: 8, [key]: value === 0 ? 0 : 20 * 1000 ** value }); }} /></label>)}</section>
      </div>}
      {page === "setup" && <div className="live-seq__controls live-seq__setup"><h2>Master</h2><label className="live-seq__switch">Soft clipper<input type="checkbox" checked={clipper.enabled} onChange={event => { const next = { ...clipper, enabled: event.target.checked }; setClipper(next); master.current?.update(next); }} /></label>{(["driveDb", "outputDb"] as const).map(key => <label className="live-seq__slider" key={key}>{key === "driveDb" ? "Drive" : "Output"}<output>{clipper[key]} dB</output><input type="range" min={key === "driveDb" ? 0 : -24} max={key === "driveDb" ? 24 : 6} step={0.5} value={clipper[key]} onChange={event => { const next = { ...clipper, [key]: Number(event.target.value) }; setClipper(next); master.current?.update(next); }} /></label>)}<h2>Playback buffers</h2><label className="live-seq__memory">Preload limit<select value={memoryLimit} onChange={event => { stop(); setMemoryLimit(Number(event.target.value)); }}>{[32, 64, 128, 256].map(mb => <option key={mb} value={mb}>{mb} MB</option>)}</select><small>{(prepared.bytes / 1024 / 1024).toFixed(1)} MB prepared · {Math.round(prepared.ms)} ms</small></label></div>}

    </div>
    {page !== "sample" && <div className="s-tray live-seq__banks">{[0, 1, 2, 3].map(b => <button key={b} className={`s-cap${bank === b ? " s-cap--on" : ""}`} onClick={() => { stop(); setBank(b); setSelected(padsOfBank(b).findIndex(p => p !== null) < 0 ? 0 : padsOfBank(b).findIndex(p => p !== null)); }}>{"ABCD"[b]}</button>)}</div>}
    <div className="s-tray live-seq__nav">{(["pads", "repeat", "keys", "sample", "setup"] as const).map(p => <button key={p} className={`s-cap${page === p ? " s-cap--on" : ""}`} onClick={() => changePage(p)}>{p === "setup" ? "Setup" : p === "sample" ? "Waveform" : p === "keys" ? "Piano" : p === "repeat" ? "Velocity" : "Pads"}</button>)}</div>
  </div>;
}
