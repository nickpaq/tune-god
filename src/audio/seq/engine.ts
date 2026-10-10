import { getAudioContext } from "../decode";
import type { Pad } from "../../components/PadPanel";
import { ownTrack, type PadSettings } from "./model";
export interface Sound {
  pad: Pad;
  label: string;
  color: string;
  shift: number;
}
interface Prepared {
  key: string;
  buffer: AudioBuffer;
  rate: number;
}
interface Voice {
  id: string;
  pad: number;
  choke: number;
  start: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  oneShot: boolean;
  end?: number;
}
export interface Duck {
  on: boolean;
  db: number;
  attack: number;
  release: number;
}
export class SeqAudio {
  readonly ctx = getAudioContext();
  private worker = new Worker(
    new URL("../../workers/seqStretch.worker.ts", import.meta.url),
    { type: "module" },
  );
  private pending = new Map<
    number,
    { resolve: (x: Float32Array[]) => void; reject: (e: Error) => void }
  >();
  private request = 0;
  private prepared = new Map<number, Prepared>();
  private identities = new WeakMap<Float32Array[], number>();
  private serial = 0;
  private voices: Voice[] = [];
  private gates = new Map<number, GainNode>();
  private pans = new Map<number, StereoPannerNode>();
  private trackGains = new Map<string, number>();
  private tracks = new Map<string, GainNode>();
  private bass = this.ctx.createGain();
  private lastBassRate = 1;
  private muteTimeline = new Map<number, { when: number; muted: boolean }[]>();
  isMuted(pad: number) {
    return (
      this.muteTimeline
        .get(pad)
        ?.filter((e) => e.when <= this.ctx.currentTime)
        .at(-1)?.muted ?? false
    );
  }
  duck: Duck = { on: true, db: 6, attack: 5, release: 120 };
  constructor() {
    this.bass.connect(this.ctx.destination);
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id);
      this.pending.delete(data.id);
      if (data.error) pending?.reject(new Error(data.error));
      else pending?.resolve(data.channels);
    };
    this.worker.onerror = () => {
      for (const p of this.pending.values())
        p.reject(new Error("Audio preparation failed"));
      this.pending.clear();
    };
  }
  resume() {
    return this.ctx.resume();
  }
  private key(
    sound: Sound,
    s: PadSettings,
    bpm: number,
    beats: number,
  ): string {
    if (!this.identities.has(sound.pad.channelData))
      this.identities.set(sound.pad.channelData, ++this.serial);
    return [
      this.identities.get(sound.pad.channelData),
      s.start,
      s.end,
      s.bars,
      s.stretch,
      sound.shift,
      bpm,
      beats,
    ].join(":");
  }
  ready(sound: Sound, s: PadSettings, bpm: number, beats: number) {
    return (
      this.prepared.get(sound.pad.index)?.key === this.key(sound, s, bpm, beats)
    );
  }
  async prepare(
    sound: Sound,
    s: PadSettings,
    bpm: number,
    beats: number,
  ): Promise<void> {
    const key = this.key(sound, s, bpm, beats);
    if (this.prepared.get(sound.pad.index)?.key === key) return;
    const { pad } = sound,
      length = pad.channelData[0].length;
    const from = Math.min(length - 1, Math.floor(s.start * length)),
      to = Math.max(from + 1, Math.floor(s.end * length));
    let channels: Float32Array[] = pad.channelData.map((c) =>
      c.slice(from, to),
    );
    const seconds = (s.bars * beats * 60) / bpm;
    let rate = 2 ** (sound.shift / 12);
    if (s.stretch === "modern" || s.stretch === "beats") {
      const id = ++this.request;
      channels = await new Promise<Float32Array[]>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage(
          {
            id,
            channels,
            sampleRate: pad.sampleRate,
            seconds,
            mode: s.stretch,
            pitch: rate,
          },
          channels.map((c) => c.buffer),
        );
      });
      rate = 1;
    } else if (s.stretch === "repitch")
      rate = channels[0].length / pad.sampleRate / seconds;
    const buffer = this.ctx.createBuffer(
      channels.length,
      channels[0].length,
      pad.sampleRate,
    );
    channels.forEach((c, i) =>
      buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i),
    );
    this.prepared.set(pad.index, { key, buffer, rate });
    this.gate(sound, s);
  }
  trackName(sound: Sound) {
    return ownTrack(sound.pad.category ?? "other")
      ? `pad:${sound.pad.index}`
      : `bank:${Math.floor(sound.pad.index / 16)}`;
  }
  private track(sound: Sound): GainNode {
    const name = this.trackName(sound);
    let node = this.tracks.get(name);
    if (!node) {
      node = this.ctx.createGain();
      this.tracks.set(name, node);
      node.gain.value = this.trackGains.get(name) ?? 1;
    }
    node.disconnect();
    node.connect(
      sound.pad.category === "bass" ? this.bass : this.ctx.destination,
    );
    return node;
  }
  setTrack(name: string, gain: number) {
    this.trackGains.set(name, gain);
    this.tracks
      .get(name)
      ?.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.005);
  }
  private gate(sound: Sound, s: PadSettings): GainNode {
    const index = sound.pad.index;
    let gate = this.gates.get(index),
      pan = this.pans.get(index);
    if (!gate || !pan) {
      gate = this.ctx.createGain();
      pan = this.ctx.createStereoPanner();
      gate.connect(pan);
      this.gates.set(index, gate);
      this.pans.set(index, pan);
    }
    pan.pan.setValueAtTime(s.pan, this.ctx.currentTime);
    pan.disconnect();
    pan.connect(this.track(sound));
    return gate;
  }
  mute(pad: number, muted: boolean, when = this.ctx.currentTime) {
    const events = (this.muteTimeline.get(pad) ?? []).filter(
      (e) => e.when < when,
    );
    events.push({ when, muted });
    this.muteTimeline.set(pad, events.slice(-64));
    const gain = this.gates.get(pad)?.gain;
    if (gain) {
      gain.cancelScheduledValues(when);
      gain.setValueAtTime(muted ? 0 : 1, when);
    }
  }
  private end(v: Voice, at: number, fade = 0.004) {
    at = Math.max(at, this.ctx.currentTime);
    if (v.end !== undefined && v.end <= at) return;
    v.end = at;
    if (at < v.start) {
      try {
        v.source.stop(at);
      } catch {}
      return;
    }
    v.gain.gain.cancelScheduledValues(at);
    v.gain.gain.setTargetAtTime(0, at, fade / 3);
    try {
      v.source.stop(at + fade);
    } catch {
      /* already ended */
    }
  }
  note(
    sound: Sound,
    s: PadSettings,
    note: number,
    velocity: number,
    when = this.ctx.currentTime,
    duration?: number,
  ): string | null {
    const prepared = this.prepared.get(sound.pad.index);
    if (!prepared) return null;
    const gate = this.gate(sound, s),
      index = sound.pad.index;
    const duplicate = this.voices.find(
      (v) => v.pad === index && Math.abs(v.start - when) < 0.00001,
    );
    if (duplicate) return duplicate.id;
    const same = this.voices.filter(
      (v) =>
        v.start <= when &&
        (v.end === undefined || v.end > when) &&
        v.pad === index,
    );
    if (this.voices.length >= 32) this.end(this.voices[0], when);
    for (const v of this.voices)
      if (
        v.start <= when &&
        (v.end === undefined || v.end > when) &&
        ((s.choke === -1 && v.pad === index) ||
          (s.choke > 0 && v.choke === s.choke))
      )
        this.end(v, when);
    if (s.choke === 0 && same.length >= s.voices) this.end(same[0], when);
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = prepared.buffer;
    const rate = prepared.rate * 2 ** (note / 12);
    source.playbackRate.setValueAtTime(
      s.glide > 0 ? this.lastBassRate : rate,
      when,
    );
    if (s.glide > 0)
      source.playbackRate.linearRampToValueAtTime(rate, when + s.glide / 1000);
    if (sound.pad.category === "bass") this.lastBassRate = rate;
    gain.gain.value =
      Math.max(0, Math.min(1, velocity)) *
      s.volume *
      10 ** ((sound.pad.knobDb ?? 0) / 20);
    source.connect(gain);
    gain.connect(gate);
    const id = `voice:${++this.serial}`,
      voice = {
        id,
        pad: index,
        choke: s.choke,
        start: when,
        source,
        gain,
        oneShot: s.oneShot,
      };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
    if (duration !== undefined && !s.oneShot)
      this.end(voice, when + duration, 0.015);
    if (sound.pad.category === "kick" && this.duck.on) {
      const d = this.duck,
        g = this.bass.gain;
      g.cancelScheduledValues(when);
      g.setValueAtTime(1, when);
      g.linearRampToValueAtTime(10 ** (-d.db / 20), when + d.attack / 1000);
      g.linearRampToValueAtTime(1, when + (d.attack + d.release) / 1000);
    }
    return id;
  }
  release(id: string | null) {
    const v = this.voices.find((v) => v.id === id);
    if (v && !v.oneShot) this.end(v, this.ctx.currentTime, 0.02);
  }
  cutPad(index: number) {
    for (const v of this.voices)
      if (v.pad === index) this.end(v, this.ctx.currentTime);
    this.prepared.delete(index);
  }
  stop() {
    this.muteTimeline.clear();
    for (const v of this.voices) this.end(v, this.ctx.currentTime);
    for (const g of this.gates.values()) {
      g.gain.cancelScheduledValues(this.ctx.currentTime);
      g.gain.value = 1;
    }
    this.bass.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bass.gain.value = 1;
  }
  dispose() {
    this.stop();
    this.worker.terminate();
    for (const p of this.pending.values())
      p.reject(new Error("Preparation cancelled"));
    this.pending.clear();
    for (const g of this.gates.values()) g.disconnect();
    for (const p of this.pans.values()) p.disconnect();
    for (const t of this.tracks.values()) t.disconnect();
    this.bass.disconnect();
  }
}
