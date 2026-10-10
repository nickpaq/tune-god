import type { CategoryId } from "../classify";
import { defaults, type PadSettings, type Sequence } from "./model";
export const sessionKey = (project: string) => `tune-god:seq:1:${project}`;
export function resetStoredType(
  project: string,
  index: number,
  category: CategoryId,
  duration: number,
  bpm: number,
  kick?: number,
): void {
  try {
    const key = sessionKey(project),
      data = JSON.parse(localStorage.getItem(key) ?? "{}"),
      before: PadSettings | undefined = data.settings?.[index];
    const next = defaults(category, duration, bpm);
    if (before)
      Object.assign(next, {
        start: before.start,
        end: before.end,
        volume: before.volume,
        pan: before.pan,
        links: before.links,
      });
    if (category === "cymbal" && next.links.length === 0 && kick !== undefined)
      next.links = [kick];
    data.settings = { ...data.settings, [index]: next };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* Best-effort browser persistence, like the parent app. */
  }
}
/** Validate imported timings before they reach the scheduler. */
export function validSequence(value: unknown): value is Sequence {
  if (!value || typeof value !== "object") return false;
  const s = value as Sequence;
  if (
    s.version !== 1 ||
    !Array.isArray(s.scenes) ||
    !s.scenes.length ||
    !s.libraries ||
    typeof s.libraries !== "object"
  )
    return false;
  for (const scene of s.scenes) {
    if (
      typeof scene.id !== "string" ||
      !scene.refs ||
      Object.values(scene.refs).some((r) => typeof r !== "string")
    )
      return false;
  }
  for (const library of Object.values(s.libraries)) {
    if (!Array.isArray(library)) return false;
    for (const p of library) {
      if (p === null) continue;
      if (!p || typeof p.id !== "string" || !p.pads) return false;
      for (const [pad, lane] of Object.entries(p.pads)) {
        if (
          !Number.isInteger(Number(pad)) ||
          Number(pad) < 0 ||
          Number(pad) > 63 ||
          !Number.isFinite(lane.beats) ||
          lane.beats <= 0 ||
          lane.beats > 1024 ||
          !Array.isArray(lane.events)
        )
          return false;
        for (const e of lane.events) {
          if (
            typeof e.id !== "string" ||
            !Number.isFinite(e.beat) ||
            e.beat < 0 ||
            e.beat >= lane.beats
          )
            return false;
          if (e.kind === "note") {
            if (
              !Number.isFinite(e.duration) ||
              e.duration <= 0 ||
              !Number.isFinite(e.note) ||
              Math.abs(e.note) > 96 ||
              !Number.isFinite(e.velocity) ||
              e.velocity < 0 ||
              e.velocity > 1
            )
              return false;
          } else if (e.kind !== "mute" || typeof e.muted !== "boolean")
            return false;
        }
      }
    }
  }
  return true;
}
