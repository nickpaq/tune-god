import { expect, it } from "vitest";
import { RepeatGrid } from "./repeatGrid";
it("waits for a global eighth-note boundary on the first touch", () => {
  const grid = new RepeatGrid(); expect(grid.change([2], 0.1)).toBe(0.5);
  expect(grid.events(0, 1.5)).toEqual([0.5, 1]);
});
it("starts faster repetitions at the next eighth boundary and completes that chunk after release", () => {
  const grid = new RepeatGrid(); grid.change([2], 0.1);
  expect(grid.change([2, 6], 0.6)).toBe(1);
  expect(grid.change([2], 1.1)).toBe(1.5);
  expect(grid.events(0.5, 2)).toEqual([0.5, 1, 1.125, 1.25, 1.375, 1.5]);
});
it("latches a faster division released before its chunk starts", () => {
  const grid = new RepeatGrid(); grid.change([2], 0.1); grid.change([2, 6], 0.6); grid.change([2], 0.7);
  expect(grid.events(0.5, 2)).toEqual([0.5, 1, 1.125, 1.25, 1.375, 1.5]);
});
it("stops on the enclosing chunk boundary and does not duplicate adjacent windows", () => {
  const grid = new RepeatGrid(); grid.change([2], 0.1); grid.change([2, 6], 0.6); grid.change([], 1.1);
  expect(grid.events(1, 1.25)).toEqual([1, 1.125]);
  expect(grid.events(1.25, 2)).toEqual([1.25, 1.375]);
});

it("a brief 64th touch produces exactly four hits within the next 16th chunk", () => {
  const grid = new RepeatGrid(); grid.change([4], 0.01); grid.change([4, 8], 0.02); grid.change([4], 0.03);
  expect(grid.events(0, 0.75)).toEqual([0.25, 0.3125, 0.375, 0.4375, 0.5]);
});

it("waits when 64ths are pressed one 64th before an eighth boundary, then finishes all eight hits", () => {
  const grid = new RepeatGrid(); grid.change([2], 0.1);
  expect(grid.change([2, 8], 1 - 1 / 16)).toBe(1);
  expect(grid.change([2], 1.01)).toBe(1.5);
  expect(grid.events(0.5, 1)).toEqual([0.5]);
  expect(grid.events(1, 1.5)).toEqual([1, 1.0625, 1.125, 1.1875, 1.25, 1.3125, 1.375, 1.4375]);
  expect(grid.events(1.5, 2)).toEqual([1.5]);
});

it("remembers the unfinished eighth chunk across release and a new sixteenth hold", () => {
  const grid = new RepeatGrid(); grid.change([2], 0.1);
  expect(grid.change([], 0.6)).toBe(1);
  // 0.75 is a sixteenth boundary, but the eighth chunk ends at beat 1.
  expect(grid.change([4], 0.7)).toBe(1);
  expect(grid.events(0.5, 1)).toEqual([0.5]);
  expect(grid.events(1, 2)).toEqual([1, 1.25, 1.5, 1.75]);
});

it("uses the new division's grid after the previous chunk has fully ended", () => {
  const grid = new RepeatGrid(); grid.change([2], 0.1); grid.change([], 0.6);
  expect(grid.change([4], 1.1)).toBe(1.25);
  expect(grid.events(1, 2)).toEqual([1.25, 1.5, 1.75]);
});
