import { useEffect, useRef, useState } from "react";
import { sessionKey, validSequence } from "../../audio/seq/session";
import { SeqAudio, type Sound, type Duck } from "../../audio/seq/engine";
import {
  defaults,
  emptyLane,
  emptySequence,
  ensurePattern,
  occurrences,
  patternFor,
  patternLength,
  performance,
  putEvent,
  snapBeat,
  trackId,
  uid,
  type PadSettings,
  type Sequence,
  type SeqEvent,
  type NoteEvent,
} from "../../audio/seq/model";
interface Saved {
  mix: Record<string, number>;
  sequence: Sequence;
  settings: Record<number, PadSettings>;
  grid: number;
  duck: Duck;
  metronome: boolean;
  autoMetronome: boolean;
  countInBars: number;
}
export function useSequencer(
  sounds: Sound[],
  bpm: number,
  beatsPerBar: number,
  projectId: string,
) {
  const storageKey = sessionKey(projectId);
  const [saved] = useState<Partial<Saved>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  });
  const [sequence, setSequence] = useState<Sequence>(
    validSequence(saved.sequence) ? saved.sequence : emptySequence,
  );
  const [settings, setSettings] = useState<Record<number, PadSettings>>(
    saved.settings ?? {},
  );
  const [mix, setMix] = useState<Record<string, number>>(saved.mix ?? {});
  const [grid, setGrid] = useState(saved.grid ?? 0.25);
  const [duck, setDuck] = useState<Duck>(
    saved.duck ?? { on: true, db: 6, attack: 5, release: 120 },
  );
  const [metronome, setMetronome] = useState(saved.metronome ?? false);
  const [autoMetronome, setAutoMetronome] = useState(saved.autoMetronome ?? false);
  const [countInBars, setCountInBars] = useState(saved.countInBars ?? 0);
  const [scene, setScene] = useState(0),
    [playing, setPlaying] = useState(false),
    [recording, setRecording] = useState(false),
    [looping, setLooping] = useState(true);
  const [position, setPosition] = useState({ scene: 0, beat: 0 }),
    [status, setStatus] = useState("Preparing audio…"),
    [ready, setReady] = useState(false);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const sequenceRef = useRef(sequence),
    soundsRef = useRef(sounds),
    settingsRef = useRef(settings),
    audio = useRef<SeqAudio | null>(null);
  const sceneRef = useRef(scene),
    recordRef = useRef(recording),
    gridRef = useRef(grid),
    loopRef = useRef(looping);
  soundsRef.current = sounds;
  settingsRef.current = settings;
  sceneRef.current = scene;
  recordRef.current = recording;
  gridRef.current = grid;
  loopRef.current = looping;
  const running = useRef(false),
    origin = useRef(0),
    scheduled = useRef(0),
    eligible = useRef(new Map<string, number>());
  const held = useRef(
    new Map<
      string,
      {
        voice: string | null;
        event?: string;
        pattern?: string;
        pad: number;
        started: number;
      }
    >(),
  );
  const muteRef = useRef<Record<number, boolean>>({});
  const countInTimer = useRef<number | null>(null);
  const countInClicks = useRef<OscillatorNode[]>([]);
  const metronomeRef = useRef(metronome);
  const autoMetronomeRef = useRef(autoMetronome);
  metronomeRef.current = metronome;
  autoMetronomeRef.current = autoMetronome;
  function config(sound: Sound): PadSettings {
    const p = sound.pad,
      c = p.category ?? "other",
      stored = settingsRef.current[p.index];
    if (stored?.category === c) return stored;
    const next = defaults(
      c,
      p.channelData[0].length / p.sampleRate,
      p.bpm ?? bpm,
      beatsPerBar,
    );
    if (stored)
      Object.assign(next, {
        start: stored.start,
        end: stored.end,
        volume: stored.volume,
        pan: stored.pan,
        links: stored.links,
      });
    if (c === "cymbal" && !stored) {
      const kick = soundsRef.current.find((s) => s.pad.category === "kick");
      if (kick) next.links = [kick.pad.index];
    }
    return next;
  }
  function edit(fn: (draft: Sequence) => void) {
    const copy = structuredClone(sequenceRef.current);
    fn(copy);
    sequenceRef.current = copy;
    setSequence(copy);
  }
  function changeSettings(index: number, patch: Partial<PadSettings>) {
    const sound = soundsRef.current.find((s) => s.pad.index === index);
    if (!sound) return;
    const s = { ...config(sound), ...patch };
    settingsRef.current = { ...settingsRef.current, [index]: s };
    setSettings(settingsRef.current);
    audio.current?.cutPad(index);
  }
  function sceneLength(index: number) {
    return Math.max(
      beatsPerBar,
      ...Object.keys(sequenceRef.current.scenes[index]?.refs ?? {}).map((t) =>
        patternLength(patternFor(sequenceRef.current, index, t), beatsPerBar),
      ),
    );
  }
  function locate(absolute: number) {
    if (loopRef.current) {
      const length = sceneLength(sceneRef.current);
      return {
        scene: sceneRef.current,
        beat: absolute % length,
        start: absolute - (absolute % length),
        length,
      };
    }
    let start = 0;
    for (let i = sceneRef.current; i < sequenceRef.current.scenes.length; i++) {
      const length = sceneLength(i);
      if (absolute < start + length)
        return { scene: i, beat: absolute - start, start, length };
      start += length;
    }
    return null;
  }
  const absoluteNow = () =>
    audio.current
      ? Math.max(
          0,
          ((audio.current.ctx.currentTime - origin.current) * bpm) / 60,
        )
      : 0;
  function stop() {
    if (countInTimer.current !== null) window.clearTimeout(countInTimer.current);
    countInTimer.current = null;
    for (const oscillator of countInClicks.current) {
      try { oscillator.stop(); } catch { /* already stopped */ }
    }
    countInClicks.current = [];
    running.current = false;
    setPlaying(false);
    setRecording(false);
    setStatus("Ready");
    recordRef.current = false;
    audio.current?.stop();
    held.current.clear();
    eligible.current.clear();
    muteRef.current = {};
    setMuted({});
  }
  function trigger(
    index: number,
    note: number,
    velocity: number,
    when: number,
    duration?: number,
    visited = new Set<number>(),
  ): string | null {
    if (visited.has(index)) return null;
    visited.add(index);
    const sound = soundsRef.current.find((s) => s.pad.index === index);
    if (!sound) return null;
    const s = config(sound),
      a = audio.current;
    if (!a?.ready(sound, s, bpm, beatsPerBar)) return null;
    const voice = a.note(sound, s, note, velocity, when, duration);
    for (const linked of s.links)
      trigger(linked, 0, velocity, when, duration, visited);
    return voice;
  }
  async function start(record = false) {
    if (!ready) {
      setStatus("Wait for audio preparation");
      return;
    }
    const a = audio.current;
    if (!a) return;
    await a.resume();
    if (countInTimer.current !== null) stop();
    if (!running.current && record && countInBars > 0) {
      setStatus("Count-in");
      recordRef.current = false;
      setRecording(false);
      const startAt = a.ctx.currentTime + 0.04;
      const totalBeats = countInBars * beatsPerBar;
      if (metronome || autoMetronome) {
        for (let beat = 0; beat < totalBeats; beat++) {
          const when = startAt + (beat * 60) / bpm;
          const osc = a.ctx.createOscillator();
          const gain = a.ctx.createGain();
          osc.frequency.value = beat % beatsPerBar === 0 ? 1320 : 880;
          gain.gain.setValueAtTime(0.0001, when);
          gain.gain.exponentialRampToValueAtTime(0.22, when + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
          osc.connect(gain).connect(a.ctx.destination);
          osc.start(when);
          osc.stop(when + 0.05);
          countInClicks.current.push(osc);
        }
      }
      countInTimer.current = window.setTimeout(() => {
        countInTimer.current = null;
        countInClicks.current = [];
        if (audio.current !== a) return;
        origin.current = a.ctx.currentTime + 0.015;
        scheduled.current = 0;
        eligible.current.clear();
        running.current = true;
        setPlaying(true);
        recordRef.current = true;
        setRecording(true);
        setStatus("Ready");
      }, (totalBeats * 60 * 1000) / bpm);
      return;
    }
    if (!running.current) {
      a.stop();
      origin.current = a.ctx.currentTime + 0.015;
      scheduled.current = 0;
      eligible.current.clear();
      running.current = true;
      setPlaying(true);
    }
    recordRef.current = record;
    setRecording(record);
  }
  function liveDown(
    index: number,
    note = 0,
    velocity = 0.8,
    key = `pad:${index}`,
    keyboard = false,
  ) {
    const sound = soundsRef.current.find((s) => s.pad.index === index),
      a = audio.current;
    if (!sound || !a) return;
    if (performance(sound.pad.category ?? "other") === "keys" && !keyboard)
      return;
    if (!a.ready(sound, config(sound), bpm, beatsPerBar)) {
      setStatus("Preparing this pad…");
      return;
    }
    void a.resume();
    const voice = trigger(index, note, velocity, a.ctx.currentTime);
    const heldNote: {
      voice: string | null;
      event?: string;
      pattern?: string;
      pad: number;
      started: number;
    } = { voice, pad: index, started: absoluteNow() };
    if (recordRef.current && running.current) {
      const abs = absoluteNow(),
        at = locate(abs);
      if (at) {
        const id = uid();
        edit((s) => {
          const pattern = ensurePattern(s, at.scene, trackId(index)),
            lane = (pattern.pads[index] ??= emptyLane(beatsPerBar));
          const beat = snapBeat(at.beat, gridRef.current, lane.beats);
          putEvent(lane, {
            id,
            kind: "note",
            beat,
            duration: 0.25,
            note,
            velocity,
          });
          eligible.current.set(
            id,
            at.start + (Math.floor(at.beat / lane.beats) + 1) * lane.beats,
          );
          heldNote.event = id;
          heldNote.pattern = pattern.id;
        });
      }
    }
    held.current.set(key, heldNote);
  }
  function liveUp(key: string) {
    const h = held.current.get(key);
    if (!h) return;
    audio.current?.release(h.voice);
    held.current.delete(key);
    if (h.event) {
      const elapsed = Math.max(0.03, absoluteNow() - h.started);
      edit((s) => {
        for (const lib of Object.values(s.libraries)) {
          const p = lib.find((p) => p?.id === h.pattern),
            event = p?.pads[h.pad]?.events.find((e) => e.id === h.event);
          if (event?.kind === "note")
            event.duration = gridRef.current
              ? Math.max(
                  gridRef.current,
                  Math.round(elapsed / gridRef.current) * gridRef.current,
                )
              : elapsed;
        }
      });
    }
  }
  function toggleMute(index: number) {
    const value = !(audio.current?.isMuted(index) ?? muteRef.current[index]);
    muteRef.current = { ...muteRef.current, [index]: value };
    setMuted(muteRef.current);
    audio.current?.mute(index, value);
    if (recordRef.current && running.current) {
      const abs = absoluteNow(),
        at = locate(abs);
      if (at)
        edit((s) => {
          const pattern = ensurePattern(s, at.scene, trackId(index)),
            lane = (pattern.pads[index] ??= emptyLane(beatsPerBar)),
            id = uid();
          putEvent(lane, {
            id,
            kind: "mute",
            beat: snapBeat(at.beat, gridRef.current, lane.beats),
            muted: value,
          });
          eligible.current.set(
            id,
            at.start + (Math.floor(at.beat / lane.beats) + 1) * lane.beats,
          );
        });
    }
  }
  function chooseScene(index: number) {
    stop();
    setScene(index);
    sceneRef.current = index;
    setPosition({ scene: index, beat: 0 });
  }
  useEffect(() => {
    const a = new SeqAudio();
    audio.current = a;
    return () => {
      running.current = false;
      a.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.duck = duck;
  }, [duck]);
  // Recheck actual audio and trim/stretch inputs, preserving decoded buffers whose keys did not change.
  const signature = sounds
    .map((s) =>
      [
        s.pad.index,
        s.pad.category,
        s.pad.sampleId,
        s.pad.name,
        s.pad.channelData[0].length,
        s.shift,
      ].join(":"),
    )
    .join("|");
  useEffect(() => {
    let cancelled = false;
    const a = audio.current;
    if (!a) return;
    setReady(false);
    void (async () => {
      try {
        for (const sound of soundsRef.current) {
          if (cancelled) return;
          const s = config(sound);
          if (!a.ready(sound, s, bpm, beatsPerBar)) {
            setStatus(`Preparing ${sound.label}…`);
            await a.prepare(sound, s, bpm, beatsPerBar);
          }
        }
        if (!cancelled) {
          setReady(true);
          setStatus("Ready");
        }
      } catch (e) {
        if (!cancelled) setStatus(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // The signature describes pad content; settings describes processing parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, settings, bpm, beatsPerBar]);
  useEffect(() => {
    stop();
  }, [bpm]); // Changing tempo cancels previously scheduled audio before re-rendering.
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ sequence, settings, grid, duck, mix, metronome, autoMetronome, countInBars }),
      );
    } catch {
      setStatus("Storage full — download a pattern backup");
    }
  }, [sequence, settings, grid, duck, mix, metronome, autoMetronome, countInBars, storageKey]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const a = audio.current;
      if (!a || !running.current) return;
      const now = absoluteNow(),
        position = locate(now);
      if (!position) {
        stop();
        return;
      }
      setPosition({ scene: position.scene, beat: position.beat });
      setMuted(
        Object.fromEntries(
          soundsRef.current.map((s) => [s.pad.index, a.isMuted(s.pad.index)]),
        ),
      );
      const until = now + (0.08 * bpm) / 60;
      if (metronomeRef.current || (recordRef.current && autoMetronomeRef.current)) {
        const first = Math.ceil((scheduled.current - 1e-8) / 1);
        const last = Math.ceil((until - 1e-8) / 1);
        for (let beat = first; beat < last; beat++) {
          const when = origin.current + (beat * 60) / bpm;
          if (when < a.ctx.currentTime - 0.005) continue;
          const osc = a.ctx.createOscillator();
          const gain = a.ctx.createGain();
          osc.frequency.value = beat % beatsPerBar === 0 ? 1320 : 880;
          gain.gain.setValueAtTime(0.0001, when);
          gain.gain.exponentialRampToValueAtTime(0.16, when + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
          osc.connect(gain).connect(a.ctx.destination);
          osc.start(when);
          osc.stop(when + 0.05);
        }
      }
      let from = scheduled.current;
      while (from < until - 1e-8) {
        const at = locate(from);
        if (!at) break;
        const end = Math.min(until, at.start + at.length);
        const scene = sequenceRef.current.scenes[at.scene];
        for (const track of Object.keys(scene.refs)) {
          const p = patternFor(sequenceRef.current, at.scene, track);
          if (!p) continue;
          for (const [key, lane] of Object.entries(p.pads)) {
            const index = Number(key),
              localFrom = from - at.start,
              localTo = end - at.start;
            // Explicit reset at each lane cycle prevents toggle-state drift on arrangement repeats.
            const boundary =
              Math.ceil((localFrom - 1e-8) / lane.beats) * lane.beats;
            if (boundary >= localFrom - 1e-8 && boundary < localTo - 1e-8)
              a.mute(
                index,
                lane.muted,
                origin.current + ((at.start + boundary) * 60) / bpm,
              );
            for (const { event, beat } of occurrences(
              lane,
              localFrom,
              localTo,
            )) {
              const absolute = at.start + beat;
              if (
                absolute <
                (eligible.current.get(event.id) ?? -Infinity) - 1e-8
              )
                continue;
              const when = Math.max(
                a.ctx.currentTime,
                origin.current + (absolute * 60) / bpm,
              );
              if (event.kind === "note")
                trigger(
                  index,
                  event.note,
                  event.velocity,
                  when,
                  (event.duration * 60) / bpm,
                );
              else a.mute(index, event.muted, when);
            }
          }
        }
        from = end;
      }
      scheduled.current = until;
    }, 20);
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
    };
    // The transport reads mutable refs so recording edits become available without restarting its clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, beatsPerBar]);
  useEffect(() => {
    for (const [name, gain] of Object.entries(mix))
      audio.current?.setTrack(name, gain);
  }, [mix]);
  function importSequence(value: Sequence) {
    stop();
    sequenceRef.current = value;
    setSequence(value);
    setScene(0);
    sceneRef.current = 0;
  }
  function laneEdit(
    index: number,
    fn: (lane: ReturnType<typeof emptyLane>) => void,
  ) {
    edit((s) => {
      const p = ensurePattern(s, sceneRef.current, trackId(index));
      fn((p.pads[index] ??= emptyLane(beatsPerBar)));
    });
  }
  function link(source: number, target: number) {
    if (source === target) return;
    const sound = soundsRef.current.find((s) => s.pad.index === source);
    if (sound)
      changeSettings(source, {
        links: [...new Set([...config(sound).links, target])],
      });
  }
  return {
    mix,
    setMix,
    sequence,
    edit,
    settings,
    config,
    changeSettings,
    grid,
    setGrid,
    duck,
    setDuck,
    metronome,
    setMetronome,
    autoMetronome,
    setAutoMetronome,
    countInBars,
    setCountInBars,
    scene,
    chooseScene,
    playing,
    recording,
    looping,
    setLooping,
    position,
    status,
    ready,
    start,
    stop,
    liveDown,
    liveUp,
    toggleMute,
    muted,
    laneEdit,
    link,
    importSequence,
    sceneLength,
    audio,
  };
}
export type Sequencer = ReturnType<typeof useSequencer>;
export type { Sound, SeqEvent, NoteEvent };
