import { describe, expect, it } from "vitest";
import { arrangeFingerDrumming, EMPTY_PAD_LABEL, type ArrangeSound } from "./fingerDrumming";
import { FINGER_LAYOUTS, layoutById, layoutSlotAt, mirrorSlots } from "./fingerLayouts";
import { classifyByName, classifySample, type CategoryId } from "./classify";

const horizontal = layoutById("horizontal");
const quest = layoutById("quest-for-groove");

let next = 0;
const sound = (category: CategoryId, extra: Partial<ArrangeSound> = {}): ArrangeSound => ({ key: next++, category, ...extra });
const drum = (category: CategoryId) => sound(category);

const indexOf = (a: ReturnType<typeof arrangeFingerDrumming>, s: ArrangeSound) => a.positions.get(s.key);

describe("arrangeFingerDrumming", () => {
  it("puts a full kit on bank A in the layout's slots", () => {
    const kick = drum("kick");
    const snare = drum("snare");
    const closed = drum("closedHat");
    const open = drum("openHat");
    const a = arrangeFingerDrumming([open, closed, snare, kick], horizontal);
    // Bottom row of "horizontal": kick, snare, closed hat, open hat.
    expect([kick, snare, closed, open].map((s) => indexOf(a, s))).toEqual([12, 13, 14, 15]);
  });

  it("fills every slot a kit can't cover with a 'missing' placeholder", () => {
    const a = arrangeFingerDrumming([drum("kick")], horizontal);
    const missing = a.placeholders.filter((p) => p.kind === "missing");
    expect(missing).toHaveLength(15);
    expect(missing.every((p) => p.index < 16)).toBe(true);
    expect(a.placeholders.find((p) => p.index === 13)?.label).toBe("add Snare");
    expect(a.placeholders.find((p) => p.index === 4)?.label).toBe("add Perc");
  });

  it("uses a same-family drum when the exact type is absent, but never an unrelated one", () => {
    const hat = drum("closedHat");
    const a = arrangeFingerDrumming([hat], horizontal);
    // Only one hat: it takes its own slot; the open hat slot stays missing rather than borrowing a kick.
    expect(indexOf(a, hat)).toBe(14);
    expect(a.placeholders.find((p) => p.index === 15)?.label).toBe("add Open Hat");

    // Horizontal has one closed hat slot, so a second closed hat stands in for the open one.
    const second = drum("closedHat");
    const b = arrangeFingerDrumming([hat, second], horizontal);
    expect(indexOf(b, second)).toBe(15);
  });

  it("puts lower percussion on the lower rows, left to right", () => {
    const high = sound("perc", { centroid: 3000 });
    const low = sound("perc", { centroid: 200 });
    const mid = sound("perc", { centroid: 900 });
    const a = arrangeFingerDrumming([high, low, mid], horizontal);
    // Horizontal's perc slots, bottom row first: 9, 10, then 4.
    expect([low, mid, high].map((s) => indexOf(a, s))).toEqual([9, 10, 4]);
  });

  it("builds a second kit only when the leftovers hold a kick, a snare and a hat", () => {
    const first = [drum("kick"), drum("snare"), drum("closedHat")];
    const withSecond = [...first, drum("kick"), drum("snare"), drum("closedHat")];
    const a = arrangeFingerDrumming(withSecond, horizontal);
    expect(a.placeholders.filter((p) => p.kind === "missing" && p.index >= 16 && p.index < 32).length).toBeGreaterThan(0);
    expect([...a.positions.values()].filter((i) => i >= 16 && i < 32)).toHaveLength(3);

    const noSecondHat = arrangeFingerDrumming([...first, drum("kick"), drum("snare")], horizontal);
    expect(noSecondHat.placeholders.some((p) => p.kind === "missing" && p.index >= 16)).toBe(false);
  });

  it("leaves bank B unarranged without a second kit and starts melodic sounds on bank C", () => {
    const bass = sound("bass", { midi: 36 });
    const lead = sound("melodic", { midi: 72 });
    const a = arrangeFingerDrumming([lead, bass, drum("kick")], horizontal);
    expect(indexOf(a, bass)).toBe(32);
    expect(indexOf(a, lead)).toBe(33);
    // Bank B is all "Empty pad", not "missing" placeholders.
    const bankB = a.placeholders.filter((p) => p.index >= 16 && p.index < 32);
    expect(bankB).toHaveLength(16);
    expect(bankB.every((p) => p.kind === "empty" && p.label === EMPTY_PAD_LABEL)).toBe(true);
  });

  it("sorts tonal sounds bass first, lowest to highest, then other, with FX in the kit", () => {
    const vocal = sound("vox", { centroid: 500 });
    const fx = sound("fx", { centroid: 300 });
    const other = sound("other", { centroid: 100 });
    const hiLead = sound("melodic", { midi: 84 });
    const loLead = sound("melodic", { midi: 60 });
    const bass = sound("bass", { midi: 40 });
    const a = arrangeFingerDrumming([other, fx, vocal, hiLead, loLead, bass], horizontal);
    const order = [bass, loLead, hiLead, other].map((s) => indexOf(a, s));
    expect(order).toEqual([32, 33, 34, 35]);
    // FX has slots in the layout, so it sits on bank A.
    expect(indexOf(a, fx)).toBeLessThan(16);
    // Vox is a drum type, so it takes one of the layout's vox slots instead.
    expect(indexOf(a, vocal)).toBeLessThan(16);
  });

  it("puts leftover drums after everything else", () => {
    const extraPerc = drum("perc");
    const pad = sound("melodic", { midi: 60 });
    const kit = [drum("kick"), drum("snare"), drum("closedHat")];
    // A fourth perc beyond what the layout has slots for is not possible here, so use a quest layout
    // (three perc slots) and overfill them.
    const toms = Array.from({ length: 4 }, () => drum("perc"));
    const a = arrangeFingerDrumming([...kit, ...toms, pad, extraPerc], quest);
    const leftover = indexOf(a, extraPerc)!;
    expect(leftover).toBeGreaterThan(indexOf(a, pad)!);
    expect(leftover).toBeLessThan(64);
  });

  it("overflows melodic sounds past bank D onto bank B's free pads", () => {
    const tonal = Array.from({ length: 34 }, (_, i) => sound("melodic", { midi: 40 + i }));
    const a = arrangeFingerDrumming([drum("kick"), ...tonal], horizontal);
    const indexes = tonal.map((s) => indexOf(a, s)!);
    expect(indexes.slice(0, 32)).toEqual(Array.from({ length: 32 }, (_, i) => 32 + i));
    expect(indexes.slice(32)).toEqual([16, 17]);
  });

  it("lets real sounds replace 'missing' placeholders when the project is nearly full", () => {
    const tonal = Array.from({ length: 60 }, (_, i) => sound("melodic", { midi: 30 + i }));
    const a = arrangeFingerDrumming([drum("kick"), ...tonal], horizontal);
    const all = [...a.positions.values(), ...a.placeholders.map((p) => p.index)];
    expect(new Set(all).size).toBe(64);
    expect(a.positions.size).toBe(61);
    // Every real sound got a pad, which required taking over bank A's missing slots.
    expect(tonal.every((s) => a.positions.has(s.key))).toBe(true);
  });

  it("gives every one of the 64 pads exactly one occupant", () => {
    for (const layout of FINGER_LAYOUTS) {
      const sounds = [drum("kick"), drum("snare"), drum("openHat"), sound("bass", { midi: 40 }), sound("fx")];
      const a = arrangeFingerDrumming(sounds, layout);
      const all = [...a.positions.values(), ...a.placeholders.map((p) => p.index)];
      expect(all.sort((x, y) => x - y)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    }
  });
});

describe("layouts", () => {
  it("all have 16 slots", () => {
    for (const l of FINGER_LAYOUTS) expect(l.slots).toHaveLength(16);
  });

  it("finds a pad's slot on banks A and B only", () => {
    const l = layoutById("horizontal");
    expect(layoutSlotAt(l, 12)?.label).toBe("Kick");
    expect(layoutSlotAt(l, 16 + 13)?.label).toBe("Snare");
    expect(layoutSlotAt(l, 32)).toBeUndefined();
  });

  it("mirrors rows left to right", () => {
    const l = layoutById("vertical");
    const m = mirrorSlots(l.slots);
    expect(m[0]).toBe(l.slots[3]);
    expect(m[12]).toBe(l.slots[15]);
  });
});

describe("classification by name", () => {
  it("reads hat types from the name", () => {
    expect(classifyByName("Open_Hat_01.wav")).toBe("openHat");
    expect(classifyByName("ride.wav")).toBe("cymbal");
    expect(classifyByName("crash 2.wav")).toBe("cymbal");
    expect(classifyByName("closed hat.wav")).toBe("closedHat");
    expect(classifyByName("hihat 3.wav")).toBe("hat");
  });

  it("separates claps from snares and sends shakers and toms to perc", () => {
    expect(classifyByName("clap.wav")).toBe("clap");
    expect(classifyByName("rim shot.wav")).toBe("snare");
    expect(classifyByName("snare.wav")).toBe("snare");
    expect(classifyByName("floor tom.wav")).toBe("perc");
    expect(classifyByName("shaker.wav")).toBe("perc");
    expect(classifyByName("breath 2.wav")).toBe("vox");
  });

  it("turns a name containing loop into the loop version of its category", () => {
    expect(classifyByName("drum loop 90.wav")).toBe("drumLoop");
    expect(classifyByName("hat_loop.wav")).toBe("drumLoop");
    expect(classifyByName("perc loop.wav")).toBe("percLoop");
    expect(classifyByName("piano loop.wav")).toBe("melodicLoop");
    expect(classifyByName("amen break.wav")).toBe("drumLoop");
    expect(classifyByName("loop 3.wav")).toBeNull();
  });

  it("resolves an unnamed hat by decay time", () => {
    const tick = (seconds: number) => {
      const sr = 44100;
      const out = new Float32Array(sr * 2);
      for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * Math.exp(-i / sr / (seconds / 4.6));
      return out;
    };
    expect(classifySample(tick(0.05), 44100, "hihat 1.wav", null)).toBe("closedHat");
    expect(classifySample(tick(0.8), 44100, "hihat 1.wav", null)).toBe("openHat");
  });
});
