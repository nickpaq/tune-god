import type { CategoryId } from "../classify";
export type Performance = "drums" | "keys" | "loop";
export type StretchMode = "off" | "modern" | "beats" | "repitch";
export interface PadSettings {
  category: CategoryId;
  oneShot: boolean;
  choke: number;
  voices: number;
  glide: number;
  start: number;
  end: number;
  bars: number;
  stretch: StretchMode;
  links: number[];
  volume: number;
  pan: number;
}
export function performance(c: CategoryId): Performance {
  return c === "melodic" || c === "bass"
    ? "keys"
    : c.endsWith("Loop")
      ? "loop"
      : "drums";
}
export function defaults(
  category: CategoryId,
  duration = 1,
  bpm = 120,
  beatsPerBar = 4,
): PadSettings {
  const p = performance(category);
  return {
    category,
    oneShot: p !== "keys",
    choke:
      category === "bass"
        ? 6
        : ["openHat", "closedHat"].includes(category)
          ? 5
          : p === "drums" || p === "loop"
            ? -1
            : 0,
    voices: p === "keys" && category !== "bass" ? 8 : 1,
    glide: category === "bass" ? 60 : 0,
    start: 0,
    end: 1,
    bars: Math.max(1, Math.round((duration * bpm) / 60 / beatsPerBar)),
    stretch:
      category === "melodicLoop" ? "modern" : p === "loop" ? "beats" : "off",
    links: [],
    volume: 1,
    pan: 0,
  };
}
export const ownTrack = (c: CategoryId) =>
  c === "melodic" || c === "melodicLoop" || c === "bass";
// Pattern ownership is always the bank; instrument lanes also have their own mixer/overview tracks.
export const trackId = (index: number, _c?: CategoryId) =>
  `bank:${Math.floor(index / 16)}`;
export interface NoteEvent {
  id: string;
  kind: "note";
  beat: number;
  duration: number;
  note: number;
  velocity: number;
}
export interface MuteEvent {
  id: string;
  kind: "mute";
  beat: number;
  muted: boolean;
}
export type SeqEvent = NoteEvent | MuteEvent;
export interface Lane {
  beats: number;
  muted: boolean;
  events: SeqEvent[];
}
export interface Pattern {
  id: string;
  pads: Record<number, Lane>;
}
export interface Scene {
  id: string;
  refs: Record<string, string>;
}
export interface Sequence {
  version: 1;
  libraries: Record<string, (Pattern | null)[]>;
  scenes: Scene[];
}
let next = 0;
export const uid = () => `${Date.now().toString(36)}-${(++next).toString(36)}`;
export const emptyLane = (beats = 4): Lane => ({
  beats,
  muted: false,
  events: [],
});
export const emptySequence = (): Sequence => ({
  version: 1,
  libraries: {},
  scenes: [{ id: uid(), refs: {} }],
});
export const patternLength = (p?: Pattern | null, fallback = 4): number =>
  Object.keys(p?.pads ?? {}).length
    ? Math.max(...Object.values(p!.pads).map((l) => l.beats))
    : fallback;
export function patternFor(
  s: Sequence,
  scene: number,
  track: string,
): Pattern | undefined {
  return (
    s.libraries[track]?.find((p) => p?.id === s.scenes[scene]?.refs[track]) ??
    undefined
  );
}
export function ensurePattern(
  s: Sequence,
  scene: number,
  track: string,
): Pattern {
  let p = patternFor(s, scene, track);
  if (!p) {
    const library = (s.libraries[track] ??= []);
    p = { id: uid(), pads: {} };
    library.push(p);
    s.scenes[scene].refs[track] = p.id;
  }
  return p;
}
export function selectSlot(
  s: Sequence,
  scene: number,
  track: string,
  slot: number,
): void {
  const from = patternFor(s, scene, track),
    library = (s.libraries[track] ??= []);
  if (!library[slot])
    library[slot] = { id: uid(), pads: structuredClone(from?.pads ?? {}) };
  s.scenes[scene].refs[track] = library[slot]!.id;
}
export function addScene(s: Sequence, after: number): void {
  s.scenes.splice(after + 1, 0, { id: uid(), refs: {} });
}
export function removeScene(s: Sequence, index: number): void {
  s.scenes.splice(index, 1);
  if (!s.scenes.length) s.scenes.push({ id: uid(), refs: {} });
}
export function duplicateScene(s: Sequence, scene: number): void {
  s.scenes.splice(scene + 1, 0, {
    id: uid(),
    refs: { ...s.scenes[scene].refs },
  });
}
export function snapBeat(beat: number, grid: number, length: number): number {
  const snapped = grid > 0 ? Math.round(beat / grid) * grid : beat;
  const wrapped = snapped % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}
export function putEvent(lane: Lane, event: SeqEvent): void {
  lane.events = lane.events.filter(
    (e) =>
      !(
        Math.abs(e.beat - event.beat) < 1e-6 &&
        e.kind === event.kind &&
        (e.kind !== "note" || event.kind !== "note" || e.note === event.note)
      ),
  );
  lane.events.push(event);
  lane.events.sort((a, b) => a.beat - b.beat);
}
export interface Occurrence {
  event: SeqEvent;
  beat: number;
}
/** Half-open scheduling window, repeating a pad's independent length within its bank. */
export function occurrences(
  lane: Lane,
  from: number,
  to: number,
): Occurrence[] {
  const out: Occurrence[] = [];
  if (lane.muted) return out;
  for (
    let cycle = Math.max(0, Math.floor(from / lane.beats));
    cycle <= Math.floor(to / lane.beats);
    cycle++
  )
    for (const event of lane.events) {
      const beat = cycle * lane.beats + event.beat;
      if (beat >= from - 1e-8 && beat < to - 1e-8) out.push({ event, beat });
    }
  return out.sort(
    (a, b) => a.beat - b.beat || (a.event.kind === "mute" ? -1 : 1),
  );
}
