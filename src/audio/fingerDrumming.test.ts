import { describe, expect, it } from "vitest";
import { arrangeFingerDrumming, type ArrangeSound } from "./fingerDrumming";
import { FINGER_LAYOUTS, layoutById, type FingerLayout } from "./fingerLayouts";
import { classifyByName, classifySample, type CategoryId } from "./classify";

const horizontal = layoutById("horizontal");

// The custom default has no ghost slots, so the ghost mechanism is tested on a layout that does.
const ghostLayout: FingerLayout = {
  ...horizontal,
  id: "ghost-test",
  slots: [
    ...horizontal.slots.slice(0, 8),
    { category: "kick", label: "Soft Kick", ghostOf: "kick" },
    { category: "snare", label: "Ghost Snare", ghostOf: "snare" },
    ...horizontal.slots.slice(10, 12),
    { category: "kick", label: "Kick" },
    { category: "snare", label: "Snare" },
    ...horizontal.slots.slice(14),
  ],
};

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
    // Bottom row of the custom kit: Kick 1, Snare 1, closed hat, Open Hat 2.
    expect([kick, snare, closed, open].map((s) => indexOf(a, s))).toEqual([12, 13, 14, 15]);
  });

  it("fills every slot a kit can't cover with a 'missing' placeholder", () => {
    const a = arrangeFingerDrumming([drum("kick")], horizontal);
    const missing = a.placeholders.filter((p) => p.kind === "missing");
    // 16 slots, minus the one kick placed.
    expect(missing).toHaveLength(15);
    expect(missing.every((p) => p.index < 16)).toBe(true);
    expect(a.placeholders.find((p) => p.index === 13)?.label).toBe("add Snare 1");
    expect(a.placeholders.find((p) => p.index === 4)?.label).toBe("add Perc");
    expect(a.placeholders.find((p) => p.index === 3)?.label).toBe("add Noise Fall");
  });

  it("uses a same-family drum when the exact type is absent, but never an unrelated one", () => {
    const hat = drum("closedHat");
    const a = arrangeFingerDrumming([hat], horizontal);
    // Only one hat: it takes its own slot; the open hat slot stays missing rather than borrowing a kick.
    expect(indexOf(a, hat)).toBe(14);
    expect(a.placeholders.find((p) => p.index === 15)?.label).toBe("add Open Hat 2");

    // The kit has one closed hat slot, so a second closed hat stands in for the open one.
    const second = drum("closedHat");
    const b = arrangeFingerDrumming([hat, second], horizontal);
    expect(indexOf(b, second)).toBe(15);
  });

  it("puts percussion low to high, left to right", () => {
    const high = sound("perc", { centroid: 3000 });
    const low = sound("perc", { centroid: 200 });
    const mid = sound("perc", { centroid: 900 });
    const a = arrangeFingerDrumming([high, low, mid], horizontal);
    // The kit's three perc slots (5, 6 and 7) fill low pitch first.
    expect([low, mid, high].map((s) => indexOf(a, s))).toEqual([4, 5, 6]);
  });

  it("starts melodic sounds on bank B and leaves no second kit", () => {
    const bass = sound("bass", { midi: 36 });
    const lead = sound("melodic", { midi: 72 });
    const extra = [drum("kick"), drum("snare"), drum("closedHat")];
    const a = arrangeFingerDrumming([lead, bass, drum("kick"), drum("snare"), drum("closedHat"), ...extra], horizontal);
    expect(indexOf(a, bass)).toBe(16);
    expect(indexOf(a, lead)).toBe(17);
    // Nothing on bank B is a "missing" placeholder: there is only one kit.
    expect(a.placeholders.some((p) => p.kind === "missing" && p.index >= 16)).toBe(false);
  });

  it("sorts tonal sounds bass first, lowest to highest, then other, with FX in the kit", () => {
    const vocal = sound("vox", { centroid: 500 });
    const fx = sound("fx", { centroid: 300 });
    const other = sound("other", { centroid: 100 });
    const hiLead = sound("melodic", { midi: 84 });
    const loLead = sound("melodic", { midi: 60 });
    const bass = sound("bass", { midi: 40 });
    const a = arrangeFingerDrumming([other, fx, vocal, hiLead, loLead, bass], horizontal);
    const order = [bass, loLead, hiLead].map((s) => indexOf(a, s));
    expect(order).toEqual([16, 17, 18]);
    // FX has slots in the layout, so it sits on bank A.
    expect(indexOf(a, fx)).toBeLessThan(16);
    // The custom kit has no vox slot, so vox goes after the tonal sounds.
    expect(indexOf(a, vocal)).toBeGreaterThanOrEqual(16);
  });

  it("backfills drums the layout had no slot for from the end of bank C, never bank D", () => {
    const pad = sound("melodic", { midi: 60 });
    const kit = [drum("kick"), drum("snare"), drum("closedHat")];
    // The layout has three perc slots, so the other three are left over.
    const toms = Array.from({ length: 6 }, () => drum("perc"));
    const a = arrangeFingerDrumming([...kit, ...toms, pad], horizontal);
    const extra = toms.map((s) => indexOf(a, s)!).filter((i) => i >= 16).sort((x, y) => x - y);
    expect(extra).toEqual([45, 46, 47]);
    expect(indexOf(a, pad)).toBe(16);
  });

  it("lets real sounds replace 'missing' placeholders when the project is nearly full", () => {
    const tonal = Array.from({ length: 44 }, (_, i) => sound("melodic", { midi: 30 + i }));
    const a = arrangeFingerDrumming([drum("kick"), ...tonal], horizontal);
    const all = [...a.positions.values(), ...a.ghosts.map((g) => g.index), ...a.placeholders.map((p) => p.index)];
    expect(new Set(all).size).toBe(48);
    expect(Math.max(...all)).toBeLessThan(48);
    expect(a.positions.size).toBe(45);
    // Every real sound got a pad, which required taking over bank A's missing slots.
    expect(tonal.every((s) => a.positions.has(s.key))).toBe(true);
  });

  it("gives every pad of banks A to C exactly one occupant and leaves bank D (the chops' bank) alone", () => {
    for (const layout of FINGER_LAYOUTS) {
      const sounds = [drum("kick"), drum("snare"), drum("openHat"), sound("bass", { midi: 40 }), sound("fx")];
      const a = arrangeFingerDrumming(sounds, layout);
      const all = [...a.positions.values(), ...a.ghosts.map((g) => g.index), ...a.placeholders.map((p) => p.index)];
      expect(all.sort((x, y) => x - y)).toEqual(Array.from({ length: 48 }, (_, i) => i));
    }
  });
});

describe("ghost slots", () => {
  it("copies the kit's own snare and kick into the ghost snare and soft kick slots", () => {
    const kick = drum("kick");
    const snare = drum("snare");
    const a = arrangeFingerDrumming([kick, snare], ghostLayout);
    expect(a.ghosts).toEqual([
      { index: 8, kind: "softKick", sourceKey: kick.key },
      { index: 9, kind: "ghostSnare", sourceKey: snare.key },
    ]);
    // Copies are not placeholders, and nothing else took their pads.
    expect(a.placeholders.some((p) => p.index === 8 || p.index === 9)).toBe(false);
  });

  it("marks a ghost slot 'add <type>' when the kit has no sound to copy", () => {
    const a = arrangeFingerDrumming([drum("kick")], ghostLayout);
    expect(a.ghosts.map((g) => g.kind)).toEqual(["softKick"]);
    expect(a.placeholders.find((p) => p.index === 9)?.label).toBe("add Snare");
  });
});

describe("layouts", () => {
  it("all have 16 slots", () => {
    for (const l of FINGER_LAYOUTS) expect(l.slots).toHaveLength(16);
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

describe("arrangeFingerDrumming for the bank loaders' layout", () => {
  const many = (category: CategoryId, n: number, extra: Partial<ArrangeSound> = {}) => Array.from({ length: n }, () => sound(category, extra));
  const sounds = [
    drum("kick"), drum("snare"), drum("closedHat"), drum("openHat"),
    ...many("melodicLoop", 12), ...many("melodic", 16), ...many("bass", 2), ...many("bass", 2, { is808: true }),
  ];
  const where = (a: ReturnType<typeof arrangeFingerDrumming>, c: CategoryId, only808?: boolean) =>
    sounds.filter((s) => s.category === c && (only808 === undefined || !!s.is808 === only808)).map((s) => indexOf(a, s)!).sort((x, y) => x - y);

  it("puts twelve melodic loops on the top three rows of bank B", () => {
    const a = arrangeFingerDrumming(sounds, horizontal, { pack: true });
    expect(where(a, "melodicLoop")).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);
  });

  it("puts two basses then two 808s on the bottom row of bank B, and the one-shots on bank C", () => {
    const a = arrangeFingerDrumming(sounds, horizontal, { pack: true });
    expect(where(a, "bass", false)).toEqual([28, 29]);
    expect(where(a, "bass", true)).toEqual([30, 31]);
    expect(where(a, "melodic")).toEqual(Array.from({ length: 16 }, (_, n) => 32 + n));
  });

  it("puts nothing on bank D, not even a placeholder", () => {
    const a = arrangeFingerDrumming([...sounds, ...many("drumLoop", 4), ...many("other", 4)], horizontal, { pack: true });
    expect(a.placeholders.some((p) => p.index >= 48)).toBe(false);
    expect([...a.positions.values()].some((i) => i >= 48)).toBe(false);
  });

  it("leaves sounds that overflow banks B and C unplaced (the app keeps them in the hot-swap pool)", () => {
    const extra = [...sounds, ...many("melodicLoop", 3), ...many("drumLoop", 3)];
    const a = arrangeFingerDrumming(extra, horizontal, { pack: true });
    expect(extra.filter((s) => a.positions.get(s.key) === undefined)).toHaveLength(6);
    expect([...a.positions.values()].every((i) => i < 48)).toBe(true);
    expect(new Set(a.positions.values()).size).toBe(a.positions.size);
  });

  it("fills all four bass pads from 808s when there is no ordinary bass", () => {
    const eights = [0, 1, 2, 3].map(() => sound("bass", { is808: true }));
    const a = arrangeFingerDrumming(eights, horizontal, { pack: true });
    expect(eights.map((s) => indexOf(a, s)).sort((x, y) => x! - y!)).toEqual([28, 29, 30, 31]);
  });
});
