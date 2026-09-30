import { describe, expect, it } from "vitest";
import { arrangeFingerDrumming, EMPTY_PAD_LABEL, type ArrangeSound } from "./fingerDrumming";
import { FINGER_LAYOUTS, layoutById, mirrorSlots } from "./fingerLayouts";
import { classifyRole } from "./drumRoles";
import type { CategoryId } from "./classify";
import type { DrumRole } from "./drumRoles";

const horizontal = layoutById("horizontal");
const quest = layoutById("quest-for-groove");

let next = 0;
const sound = (category: CategoryId, extra: Partial<ArrangeSound> = {}): ArrangeSound => ({ key: next++, category, ...extra });
const drum = (category: CategoryId, role?: DrumRole) => sound(category, { role });

const indexOf = (a: ReturnType<typeof arrangeFingerDrumming>, s: ArrangeSound) => a.positions.get(s.key);

describe("arrangeFingerDrumming", () => {
  it("puts a full kit on bank A in the layout's slots", () => {
    const kick = drum("kick");
    const snare = drum("snare");
    const closed = drum("hat", "closedHat");
    const open = drum("hat", "openHat");
    const a = arrangeFingerDrumming([open, closed, snare, kick], horizontal);
    // Bottom row of "horizontal": kick, snare, closed hat, open hat.
    expect([kick, snare, closed, open].map((s) => indexOf(a, s))).toEqual([12, 13, 14, 15]);
  });

  it("fills every slot a kit can't cover with a 'missing' placeholder", () => {
    const a = arrangeFingerDrumming([drum("kick")], horizontal);
    const missing = a.placeholders.filter((p) => p.kind === "missing");
    expect(missing).toHaveLength(15);
    expect(missing.every((p) => p.index < 16)).toBe(true);
    expect(a.placeholders.find((p) => p.index === 13)?.label).toBe("missing Snare");
    expect(a.placeholders.find((p) => p.index === 4)?.label).toBe("missing High Tom");
  });

  it("uses a same-category drum when the exact role is absent, but never another category", () => {
    const hat = drum("hat", "closedHat");
    const a = arrangeFingerDrumming([hat], horizontal);
    // Only one hat: it takes its own slot; the open hat slot stays missing rather than borrowing a kick.
    expect(indexOf(a, hat)).toBe(14);
    expect(a.placeholders.find((p) => p.index === 15)?.label).toBe("missing Open Hat");

    const second = drum("hat", "closedHat");
    const b = arrangeFingerDrumming([hat, second], horizontal);
    expect(indexOf(b, second)).toBe(15);
  });

  it("orders toms low to high across the low, mid and high slots", () => {
    const high = sound("perc", { role: "tom", centroid: 3000 });
    const low = sound("perc", { role: "tom", centroid: 200 });
    const mid = sound("perc", { role: "tom", centroid: 900 });
    const a = arrangeFingerDrumming([high, low, mid], horizontal);
    // Horizontal row 2 reads: High Tom, Mid Tom, Low Tom.
    expect([high, mid, low].map((s) => indexOf(a, s))).toEqual([4, 5, 6]);
  });

  it("builds a second kit only when the leftovers hold a kick, a snare and a hat", () => {
    const first = [drum("kick"), drum("snare"), drum("hat", "closedHat")];
    const withSecond = [...first, drum("kick"), drum("snare"), drum("hat", "closedHat")];
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

  it("sorts tonal sounds bass first, lowest to highest, then vocals and FX, then other", () => {
    const vocal = sound("vocal", { centroid: 500 });
    const fx = sound("fx", { centroid: 300 });
    const other = sound("other", { centroid: 100 });
    const hiLead = sound("melodic", { midi: 84 });
    const loLead = sound("melodic", { midi: 60 });
    const bass = sound("bass", { midi: 40 });
    const a = arrangeFingerDrumming([other, fx, vocal, hiLead, loLead, bass], horizontal);
    const order = [bass, loLead, hiLead, vocal, fx, other].map((s) => indexOf(a, s));
    expect(order).toEqual([32, 33, 34, 35, 36, 37]);
  });

  it("puts leftover drums after everything else", () => {
    const extraPerc = drum("perc");
    const pad = sound("melodic", { midi: 60 });
    const kit = [drum("kick"), drum("snare"), drum("hat", "closedHat")];
    // A fourth perc beyond what the layout has slots for is not possible here, so use a quest layout
    // (one perc-category slot per tom) and overfill toms.
    const toms = Array.from({ length: 4 }, () => drum("perc", "tom"));
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
      const sounds = [drum("kick"), drum("snare"), drum("hat", "openHat"), sound("bass", { midi: 40 }), sound("fx")];
      const a = arrangeFingerDrumming(sounds, layout);
      const all = [...a.positions.values(), ...a.placeholders.map((p) => p.index)];
      expect(all.sort((x, y) => x - y)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    }
  });

  it("treats a stale role as the category default once the pad is recategorised", () => {
    const wasOpenHat = drum("kick", "openHat");
    const a = arrangeFingerDrumming([wasOpenHat], horizontal);
    expect(indexOf(a, wasOpenHat)).toBe(12);
  });
});

describe("layouts", () => {
  it("all have 16 slots", () => {
    for (const l of FINGER_LAYOUTS) expect(l.slots).toHaveLength(16);
  });

  it("mirrors rows left to right", () => {
    const l = layoutById("vertical");
    const m = mirrorSlots(l.slots);
    expect(m[0]).toBe(l.slots[3]);
    expect(m[12]).toBe(l.slots[15]);
  });
});

describe("classifyRole", () => {
  it("reads hat types from the name, then from decay", () => {
    expect(classifyRole("Open_Hat_01.wav", "hat")).toBe("openHat");
    expect(classifyRole("ride.wav", "hat")).toBe("ride");
    expect(classifyRole("crash 2.wav", "hat")).toBe("crash");
    expect(classifyRole("sample 7.wav", "hat", { decay: 0.6 })).toBe("openHat");
    expect(classifyRole("sample 7.wav", "hat", { decay: 0.05 })).toBe("closedHat");
    expect(classifyRole("sample 7.wav", "hat", { decay: 1.8 })).toBe("crash");
  });

  it("separates claps, rims and toms", () => {
    expect(classifyRole("clap.wav", "snare")).toBe("clap");
    expect(classifyRole("rim shot.wav", "snare")).toBe("rim");
    expect(classifyRole("snare.wav", "snare")).toBe("snare");
    expect(classifyRole("floor tom.wav", "perc")).toBe("tom");
    expect(classifyRole("conga.wav", "perc")).toBe("perc");
    expect(classifyRole("bass.wav", "bass")).toBeUndefined();
  });
});
