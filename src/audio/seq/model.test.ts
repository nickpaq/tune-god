import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../classify";
import {
  defaults,
  performance,
  emptySequence,
  emptyLane,
  ensurePattern,
  duplicateScene,
  patternFor,
  patternLength,
  selectSlot,
  putEvent,
  snapBeat,
  occurrences,
} from "./model";
describe("type locks", () => {
  it("assigns exactly one of the three performance pages to all fifteen types", () => {
    const groups = {
      keys: CATEGORIES.filter((c) => performance(c.id) === "keys"),
      loop: CATEGORIES.filter((c) => performance(c.id) === "loop"),
      drums: CATEGORIES.filter((c) => performance(c.id) === "drums"),
    };
    expect(groups.keys?.map((c) => c.id)).toEqual(["bass", "melodic"]);
    expect(groups.loop?.map((c) => c.id)).toEqual([
      "drumLoop",
      "percLoop",
      "melodicLoop",
    ]);
    expect(groups.drums).toHaveLength(10);
  });
  it("applies hats 5, bass 6, drum self choke and loop one shots", () => {
    expect(defaults("openHat").choke).toBe(5);
    expect(defaults("closedHat").choke).toBe(5);
    expect(defaults("bass")).toMatchObject({
      choke: 6,
      oneShot: false,
      glide: 60,
    });
    expect(defaults("kick")).toMatchObject({
      choke: -1,
      oneShot: true,
      voices: 1,
    });
    expect(defaults("drumLoop")).toMatchObject({
      choke: -1,
      oneShot: true,
      stretch: "beats",
    });
    expect(defaults("melodicLoop").stretch).toBe("modern");
  });
});
describe("bank patterns and independent pad lengths", () => {
  it("uses the longest lane and repeats shorter patterns without duplicating notes at scheduler boundaries", () => {
    const lane = emptyLane(4);
    lane.events = [
      { id: "a", kind: "note", beat: 0, duration: 1, note: 0, velocity: 1 },
    ];
    expect(
      patternLength({ id: "p", pads: { 0: lane, 1: emptyLane(12) } }),
    ).toBe(12);
    expect(occurrences(lane, 0, 12).map((e) => e.beat)).toEqual([0, 4, 8]);
    expect(
      [...occurrences(lane, 0, 4), ...occurrences(lane, 4, 8)].map(
        (e) => e.beat,
      ),
    ).toEqual([0, 4]);
  });
  it("propagates shared edits but a copied bank slot is independent and only changes the selected arrangement section", () => {
    const s = emptySequence(),
      p = ensurePattern(s, 0, "bank:0");
    p.pads[0] = emptyLane(8);
    duplicateScene(s, 0);
    p.pads[0].events.push({
      id: "hit",
      kind: "note",
      beat: 1,
      duration: 1,
      note: 0,
      velocity: 1,
    });
    expect(patternFor(s, 1, "bank:0")!.pads[0].events).toHaveLength(1);
    selectSlot(s, 1, "bank:0", 1);
    const copy = patternFor(s, 1, "bank:0")!;
    copy.pads[0].events = [];
    copy.pads[0].muted = true;
    expect(patternFor(s, 0, "bank:0")!.pads[0]).toMatchObject({ muted: false });
    expect(patternFor(s, 0, "bank:0")!.pads[0].events).toHaveLength(1);
    expect(copy.id).not.toBe(p.id);
  });
  it("supports sub-bar patterns without forcing their bank to one bar", () => {
    expect(patternLength({ id: "p", pads: { 0: emptyLane(1) } })).toBe(1);
  });
});
describe("recorded quantization and mute automation", () => {
  it("snaps recorded beats and wraps end-of-pattern rounding without changing the live input timestamp", () => {
    const live = 0.137;
    expect(snapBeat(live, 0.25, 4)).toBe(0.25);
    expect(live).toBe(0.137);
    expect(snapBeat(3.99, 0.25, 4)).toBe(0);
    expect(snapBeat(live, 0, 4)).toBe(live);
  });
  it("records explicit mute states and replaces events only at the same grid position", () => {
    const l = emptyLane(4);
    putEvent(l, { id: "a", kind: "mute", beat: 1, muted: true });
    putEvent(l, { id: "b", kind: "mute", beat: 2, muted: false });
    putEvent(l, { id: "c", kind: "mute", beat: 1, muted: false });
    expect(l.events).toHaveLength(2);
    expect(
      occurrences(l, 4, 8).map((e) => [
        e.beat,
        e.event.kind === "mute" && e.event.muted,
      ]),
    ).toEqual([
      [5, false],
      [6, false],
    ]);
  });
});
