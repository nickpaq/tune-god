import { describe, expect, it } from "vitest";
import { approach, centredStart, clampViewStart, defaultSpan, isDrag, MIN_SPAN_FRAMES, moveMarker, spanAfterDrag, TAP_SLOP_PX, viewStart, ZOOM_DEAD_ZONE_PX, zoomRate, zoomRoom, zoomTravel } from "./zoom";

describe("zoomRoom", () => {
  it("is the whole way from the finger to the bottom of the screen, never less than the minimum", () => {
    expect(zoomRoom(300, 800)).toBe(500);
    expect(zoomRoom(790, 800)).toBe(120);
  });
});

describe("zoomTravel", () => {
  it("counts nothing until the finger has passed the dead zone, up or down", () => {
    expect(zoomTravel(0)).toBe(0);
    expect(zoomTravel(ZOOM_DEAD_ZONE_PX)).toBe(0);
    expect(zoomTravel(-ZOOM_DEAD_ZONE_PX)).toBe(0);
    expect(zoomTravel(10)).toBe(0);
    expect(zoomTravel(-ZOOM_DEAD_ZONE_PX + 1)).toBe(0);
  });

  it("then counts only the part beyond it, so zoom starts from nothing with no jump", () => {
    expect(zoomTravel(ZOOM_DEAD_ZONE_PX + 1)).toBe(1);
    expect(zoomTravel(ZOOM_DEAD_ZONE_PX + 40)).toBe(40);
    expect(zoomTravel(-(ZOOM_DEAD_ZONE_PX + 40))).toBe(-40);
    // continuous across the threshold
    expect(Math.abs(zoomTravel(ZOOM_DEAD_ZONE_PX + 0.01) - zoomTravel(ZOOM_DEAD_ZONE_PX - 0.01))).toBeLessThan(0.02);
  });

  it("keeps the whole drag smooth: zoom through the dead zone is the unchanged span", () => {
    const rate = zoomRate(5_000_000, 200);
    for (const dy of [-20, -5, 0, 5, 20]) expect(spanAfterDrag(3_000_000, zoomTravel(dy), rate, 10_000_000)).toBeCloseTo(3_000_000, 6);
  });
});

describe("zooming by dragging up and down", () => {
  const total = 10_000_000;
  const rate = zoomRate(5_000_000, 200);

  it("down zooms in and up zooms out, by the same ratio for every equal step", () => {
    const ratios = [0, 10, 20, 30, 40].map((dy) => spanAfterDrag(4_000_000, dy + 10, rate, total) / spanAfterDrag(4_000_000, dy, rate, total));
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9);
    expect(ratios[0]).toBeLessThan(1);
    expect(spanAfterDrag(4_000_000, -10, rate, total)).toBeGreaterThan(4_000_000);
    expect(spanAfterDrag(4_000_000, -10, rate, total) * spanAfterDrag(4_000_000, 10, rate, total)).toBeCloseTo(4_000_000 ** 2, 0);
  });

  it("starts from whatever zoom the view has, so a view left zoomed in zooms from there", () => {
    expect(spanAfterDrag(2_000, 0, rate, total)).toBeCloseTo(2_000, 9);
    expect(spanAfterDrag(2_000, -50, rate, total)).toBeGreaterThan(2_000);
    expect(spanAfterDrag(2_000, 50, rate, total)).toBeLessThan(2_000);
  });

  it("takes the resting view to the closest in exactly the room it was given", () => {
    expect(spanAfterDrag(5_000_000, 200, rate, total)).toBeCloseTo(MIN_SPAN_FRAMES, 3);
  });

  it("stops at the closest view and at the whole song", () => {
    expect(spanAfterDrag(5_000_000, 100_000, rate, total)).toBe(MIN_SPAN_FRAMES);
    expect(spanAfterDrag(5_000_000, -100_000, rate, total)).toBe(total);
  });

  it("is a smooth gradient: a tiny step changes the span by a tiny fraction", () => {
    expect(spanAfterDrag(1_000_000, 0.5, rate, total) / 1_000_000).toBeGreaterThan(0.97);
  });
});

describe("moveMarker", () => {
  const total = 10_000_000;
  const width = 360;
  const grab = { frame: 1_000_000, across: 0.2, span: 4_000_000 };

  it("keeps the marker at the same place across the view and moves the waveform with the finger: dragging right makes the cut earlier", () => {
    const next = moveMarker(grab, 40, width, 4_000_000, total);
    expect(next.across).toBe(0.2);
    expect(next.frame - grab.frame).toBeCloseTo(-(40 / width) * 4_000_000, 3);
    // the waveform has moved right across the screen: what was at the start of the view is further along now
    expect(viewStart(next)).toBeLessThan(viewStart(grab));
  });

  it("keeps the finger on the same point of the waveform however far it is dragged", () => {
    const fingerAcross = 0.6;
    let v = grab;
    const underFinger = (g: typeof grab, finger: number) => viewStart(g) + finger * g.span;
    const before = underFinger(v, fingerAcross);
    // drag right by 30 px, then back, then left, at different zooms
    let finger = fingerAcross;
    for (const [dx, span] of [[30, 4_000_000], [-12, 4_000_000], [-25, 4_000_000]] as const) {
      v = moveMarker({ ...v, span }, dx, width, span, total);
      finger += dx / width;
      expect(underFinger(v, finger)).toBeCloseTo(before, 3);
    }
  });

  it("covers less time per pixel the further in the view is zoomed", () => {
    const wide = Math.abs(moveMarker(grab, 10, width, 4_000_000, total).frame - grab.frame);
    const close = Math.abs(moveMarker(grab, 10, width, 400, total).frame - grab.frame);
    expect(close / wide).toBeCloseTo(400 / 4_000_000, 9);
  });

  it("never moves the marker by zooming alone", () => {
    let v = grab;
    for (const span of [4_000_000, 1_000_000, 100_000, 5_000, 360, 50_000, 3_000_000]) {
      v = moveMarker(v, 0, width, span, total);
      expect(v.frame).toBe(1_000_000);
      expect(v.across).toBe(0.2);
    }
  });

  it("keeps the marker's place on the screen while zooming", () => {
    const a = moveMarker(grab, 0, width, 1_000_000, total);
    const b = moveMarker(a, 0, width, 1_000, total);
    for (const v of [a, b]) expect((v.frame - viewStart(v)) / v.span).toBeCloseTo(0.2, 9);
  });

  it("stops at the ends of the song, with the view stopping with it", () => {
    const end = moveMarker({ ...grab, frame: total - 100 }, -500, width, 100_000, total);
    expect(end.frame).toBe(total);
    const again = moveMarker(end, -50, width, 100_000, total);
    expect(viewStart(again)).toBe(viewStart(end));
    expect(moveMarker({ ...grab, frame: 100 }, 500, width, 100_000, total).frame).toBe(0);
  });

  it("a finger path that zooms right in lets a point be placed to a frame or better", () => {
    expect(Math.abs(moveMarker(grab, 1, 360, MIN_SPAN_FRAMES, total).frame - grab.frame)).toBeCloseTo(1, 9);
  });
});

describe("defaultSpan", () => {
  it("is about half the song", () => {
    expect(defaultSpan(10_000_000)).toBe(5_000_000);
    expect(defaultSpan(100)).toBe(MIN_SPAN_FRAMES);
  });
});

describe("approach", () => {
  it("moves toward the target without overshooting, however the time is split into frames", () => {
    let a = 0;
    for (let i = 0; i < 10; i++) a = approach(a, 1, 10);
    const b = approach(0, 1, 100);
    expect(a).toBeCloseTo(b, 9);
    expect(approach(0, 1, 70)).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(approach(0.5, 0.9, 0)).toBe(0.5);
    expect(approach(0.5, 0.9, 10_000)).toBeCloseTo(0.9, 6);
  });
});

describe("isDrag", () => {
  it("is a tap until the finger has travelled the slop in any direction", () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(TAP_SLOP_PX - 1, 0)).toBe(false);
    expect(isDrag(0, -(TAP_SLOP_PX - 1))).toBe(false);
    expect(isDrag(TAP_SLOP_PX, 0)).toBe(true);
    expect(isDrag(0, TAP_SLOP_PX)).toBe(true);
    // diagonal: 5 and 5 is 7.07, a tap; 6 and 6 is 8.49, a drag
    expect(isDrag(5, 5)).toBe(false);
    expect(isDrag(6, 6)).toBe(true);
  });
});

describe("centring a point", () => {
  it("puts the point in the middle of the view", () => {
    const span = 1_000;
    const start = centredStart(5_000, span);
    expect((5_000 - start) / span).toBe(0.5);
  });

  it("lets the very first and last frames of the song be centred, which a view held inside the song could not", () => {
    const total = 4_000_000;
    const span = 2_000_000;
    // bar 1 is 1.1 s in at 44.1 kHz: centring it needs a view that starts before the song
    expect(clampViewStart(centredStart(48510, span), span, total)).toBe(centredStart(48510, span));
    expect(clampViewStart(centredStart(total, span), span, total)).toBe(centredStart(total, span));
  });

  it("still stops the view running further off the song than half its width", () => {
    expect(clampViewStart(-5_000_000, 2_000_000, 4_000_000)).toBe(-1_000_000);
    expect(clampViewStart(9_000_000, 2_000_000, 4_000_000)).toBe(3_000_000);
  });
});
