import { describe, expect, it } from "vitest";
import { approach, approachSpan, defaultSpan, dragStep, MIN_SPAN_FRAMES, spanAt, viewStart, zoomDepth, zoomRoom } from "./zoom";

describe("spanAt", () => {
  const resting = 4_000_000;
  it("is the resting span at depth 0 and the closest at depth 1", () => {
    expect(spanAt(0, resting)).toBeCloseTo(resting, 6);
    expect(spanAt(1, resting)).toBeCloseTo(MIN_SPAN_FRAMES, 6);
  });

  it("zooms by the same ratio for every equal step down: a smooth gradient, no jumps", () => {
    const ratios = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((d) => spanAt(d + 0.1, resting) / spanAt(d, resting));
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9);
    // and each tiny step changes the span by only a tiny fraction
    expect(spanAt(0.501, resting) / spanAt(0.5, resting)).toBeGreaterThan(0.98);
  });

  it("never zooms out past the resting span or in past the closest", () => {
    expect(spanAt(-3, resting)).toBeCloseTo(resting, 6);
    expect(spanAt(7, resting)).toBeCloseTo(MIN_SPAN_FRAMES, 6);
  });
});

describe("zoomDepth and zoomRoom", () => {
  it("measures travel down against the room to the bottom of the screen", () => {
    expect(zoomDepth(-20, 100)).toBe(0);
    expect(zoomDepth(50, 100)).toBe(0.5);
    expect(zoomDepth(500, 100)).toBe(1);
    expect(zoomRoom(300, 800)).toBe(250);
    expect(zoomRoom(790, 800)).toBe(60);
  });
});

describe("dragStep", () => {
  const start = { frame: 1_000_000, across: 0.5, span: 4_000_000 };
  const width = 360;

  it("keeps the point under the finger: it moves across the view by exactly the finger's travel", () => {
    const next = dragStep(start, 36, width, start.span);
    expect(next.across).toBeCloseTo(0.6, 9);
  });

  it("covers less time per pixel the further in the view is zoomed", () => {
    const wide = dragStep(start, 10, width, 4_000_000).frame - start.frame;
    const close = dragStep(start, 10, width, 400).frame - start.frame;
    expect(wide).toBeCloseTo((10 / width) * 4_000_000, 3);
    expect(close).toBeCloseTo((10 / width) * 400, 6);
    expect(close / wide).toBeCloseTo(400 / 4_000_000, 9);
  });

  it("zooming without moving the finger leaves the point where it is, in time and across the view", () => {
    const next = dragStep(start, 0, width, 5000);
    expect(next.frame).toBe(start.frame);
    expect(next.across).toBe(0.5);
    // so the view start follows the zoom: the point stays at the same place on the screen
    expect(viewStart(next)).toBeCloseTo(start.frame - 0.5 * 5000, 6);
  });

  it("stops at the edge of the view", () => {
    const next = dragStep(start, 10_000, width, start.span);
    expect(next.across).toBeCloseTo(0.98, 9);
    expect(dragStep(next, 500, width, start.span).frame).toBe(next.frame);
  });

  it("a finger path that zooms right in lets a point be placed to a frame or better", () => {
    // 360 px across 360 frames: one pixel is one frame
    const next = dragStep(start, 1, 360, MIN_SPAN_FRAMES);
    expect(next.frame - start.frame).toBeCloseTo(1, 9);
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

  it("zooms a span out by the same ratio each step", () => {
    const target = 4_000_000;
    let span = 400;
    const ratios: number[] = [];
    for (let i = 0; i < 5; i++) {
      const next = approachSpan(span, target, 16);
      ratios.push(Math.log(target / next) / Math.log(target / span));
      span = next;
    }
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9);
    expect(approachSpan(400, target, 100_000)).toBeCloseTo(target, 0);
  });
});
