import { expect, it } from "vitest";
import { replaceCorrectedPad } from "./correctPadType";
import type { Pad } from "../components/PadPanel";
const sound = (index: number, category: Pad["category"], extra: Partial<Pad> = {}): Pad => ({ index, origIndex: index, name: `${category}.wav`, sampleId: index, sampleRate: 1000, channelData: [new Float32Array(1000)], category, tune: false, semis: 0, cents: 0, ...extra });
it("keeps a hat corrected to vocal in hot swap and refills its original pad with another hat", () => {
  const original = sound(14, "closedHat", { libraryId: "misclassified" });
  const corrected = { ...original, category: "vox" as const, classification: { category: "vox" as const, confidence: 1, needsReview: false, evidence: "correction" as const } };
  const spare = sound(-1, "closedHat", { origIndex: 70, libraryId: "replacement" });
  const bankD = sound(48, "vox");
  const next = replaceCorrectedPad({ 14: original, 48: bankD }, { 70: spare }, corrected, "closedHat");
  expect(next.pads[14]).toMatchObject({ index: 14, origIndex: 70, category: "closedHat" });
  expect(next.hidden[14]).toMatchObject({ index: -1, origIndex: 14, category: "vox", classification: { evidence: "correction" } });
  expect(next.hidden[70]).toBeUndefined();
  expect(next.pads[48]).toBe(bankD);
  expect(original.category).toBe("closedHat");
});
it("leaves a clearly marked gap when no matching spare exists, retaining the corrected sound", () => {
  const corrected = sound(14, "vox");
  const other = sound(-1, "openHat", { origIndex: 70 });
  const next = replaceCorrectedPad({ 14: sound(14, "closedHat") }, { 70: other }, corrected, "closedHat");
  expect(next.replacement).toBeNull();
  expect(next.pads[14].placeholder?.label).toBe("add Closed Hat");
  expect(next.hidden[14].category).toBe("vox");
  expect(next.hidden[70]).toBe(other);
});
it("does not replace locked pads or reuse a sample identity already on another pad", () => {
  const locked = sound(14, "vox", { locked: true });
  expect(replaceCorrectedPad({ 14: locked }, {}, locked, "closedHat").pads[14]).toBe(locked);
  const next = replaceCorrectedPad({ 14: sound(14, "closedHat"), 15: sound(15, "closedHat", { libraryId: "same" }) }, { 70: sound(-1, "closedHat", { origIndex: 70, libraryId: "same" }) }, sound(14, "vox"), "closedHat");
  expect(next.replacement).toBeNull();
});
