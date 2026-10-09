import { expect, it } from "vitest";
import { stepLayout, toggleStep } from "./steps";
it("wraps time into eight-step rows and adds rows as a pattern grows", () => {
  expect(stepLayout({ bars: 1, notes: [] }, 4, 16).rows).toEqual([[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]]);
  expect(stepLayout({ bars: 8, notes: [] }, 4, 16).rows).toHaveLength(16);
  expect(stepLayout({ bars: 1, notes: [] }, 4, 8).rows).toHaveLength(1);
});
it("step edits affect only the selected pad and pitch", () => {
  const original = { bars: 1, notes: [{ pad: 1, tick: 0, pitch: 0, velocity: 90, length: 1024 }] };
  const added = toggleStep(original, 0, 0, 1024);
  expect(added.notes).toHaveLength(2);
  expect(toggleStep(added, 0, 0, 1024)).toEqual(original);
});
