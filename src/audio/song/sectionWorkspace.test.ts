import { describe, expect, it } from "vitest";
import { baseGrid, commit, startHistory, undo } from "./chopMarks";
import {
  addCandidate,
  placeCandidate,
  repeatPrevious,
  nextOffset,
  packArrangement,
  pieceAudio,
  sourceCandidates,
  trimPrevious,
  rewindLastBar,
  type WorkspaceState,
} from "./sectionWorkspace";
import type { MakerChop } from "./patternMaker";
const colors = ["#f00", "#ff0", "#0f0", "#00f"];
const grid = baseGrid(1000, 4, 120, 0.125);
const piece: MakerChop = {
  slice: 0,
  start: 125 + 5 * 125,
  length: 1000,
  steps: 8,
  bars: 0.5,
  barIndex: 0,
  colorIndex: 0,
  color: "#f00",
};

describe("source sections and inherited offsets", () => {
  it("keeps downbeat phase and gives every alternative the exact musical offset", () => {
    const candidates = sourceCandidates(grid, 32125, 4, 5, 8, colors);
    expect(candidates.map((c) => c.start)).toEqual([750, 8750, 16750, 24750]);
    expect(candidates.every((c) => c.steps === 8)).toBe(true);
    expect(candidates.map((c) => c.colorIndex)).toEqual([0, 0, 0, 0]);
  });
  it("stacks all 100 one-bar sections with the selected offset", () => {
    const candidates = sourceCandidates(grid, 200125, 1, 3, 1, colors);
    expect(candidates).toHaveLength(100);
    expect(candidates[99].start).toBe(198500);
    expect(candidates.every((c) => c.steps === 1)).toBe(true);
  });
  it("resumes alignment after a wildcard, silence, trimming, and undo", () => {
    const elsewhere = { ...piece, start: 125 + 29 * 125, steps: 2 };
    const state: WorkspaceState = {
      chops: [piece, elsewhere],
      cuts: [],
      slots: [
        { kind: "chop", chop: 0, steps: 8 },
        { kind: "chop", chop: 1, steps: 2, alignedStart: 13 },
      ],
    };
    expect(nextOffset(state, 64, grid)).toBe(15);
    expect(
      nextOffset(
        { ...state, slots: [...state.slots, { kind: "silence", steps: 2 }] },
        64,
        grid,
      ),
    ).toBe(17);
    expect(
      nextOffset({ ...state, slots: trimPrevious(state.slots, 1) }, 64, grid),
    ).toBe(14);
    expect(
      nextOffset({ ...state, slots: state.slots.slice(0, -1) }, 64, grid),
    ).toBe(13);
  });
  it("inherits the endpoint after shortening, silence, and section wrap", () => {
    const state: WorkspaceState = {
      chops: [piece],
      slots: [{ kind: "chop", chop: 0, steps: 8 }],
      cuts: [],
    };
    expect(nextOffset(state, 64, grid)).toBe(13);
    expect(
      nextOffset(
        {
          ...state,
          slots: [
            { kind: "chop", chop: 0, steps: 3 },
            { kind: "silence", steps: 60 },
          ],
        },
        64,
        grid,
      ),
    ).toBe(4);
  });
  it("uses the corrected phase anchors for later sections rather than accumulating one tempo from zero", () => {
    const driftGrid = {
      ...grid,
      segments: [...grid.segments, { line: 16, frame: 8200, beatFrames: 500 }],
    };
    expect(sourceCandidates(driftGrid, 33000, 4, 0, 16, colors)[1].start).toBe(
      8200,
    );
  });
  it("does not offer a tail without one complete sixteenth", () => {
    const result = sourceCandidates(grid, 8140, 4, 63, 8, colors);
    expect(result).toHaveLength(1);
    expect(result[0].steps).toBe(1);
  });
  it("restores cuts and assembled pieces with undo without mutating earlier snapshots", () => {
    const state: WorkspaceState = { chops: [], slots: [], cuts: [5] };
    const next = addCandidate(state, piece);
    const h = commit(startHistory(state), next);
    expect(undo(h).present).toBe(state);
    expect(state.chops).toHaveLength(0);
    expect(next.slots).toEqual([{ kind: "chop", chop: 0, steps: 8 }]);
  });
});

describe("earlier chop replacement", () => {
  it("replaces the selected slot while retaining both sides and all their durations", () => {
    const state: WorkspaceState = {
      chops: [piece],
      cuts: [],
      slots: [
        { kind: "chop", chop: 0, steps: 8 },
        { kind: "silence", steps: 2 },
        { kind: "chop", chop: 0, steps: 8 },
      ],
    };
    const other = {
      ...piece,
      start: piece.start + 2000,
      steps: 2,
      length: 250,
    };
    const result = placeCandidate(state, other, 1, 8);
    expect(result.slots).toEqual([
      state.slots[0],
      { kind: "chop", chop: 1, steps: 2, alignedStart: 8 },
      state.slots[2],
    ]);
    expect(state.slots[1].kind).toBe("silence");
    const h = commit(startHistory(state), result);
    expect(undo(h).present).toBe(state);
  });
  it("repeats the previous source across a gap while retaining its confirmed length", () => {
    const state: WorkspaceState = {
      chops: [piece],
      cuts: [],
      slots: [
        { kind: "chop", chop: 0, steps: 2 },
        { kind: "silence", steps: 1 },
      ],
    };
    const repeated = repeatPrevious(state, null, grid, 10000);
    const last = repeated.slots.at(-1)!;
    expect(last.steps).toBe(2);
    expect(last.kind === "chop" && repeated.chops[last.chop].start).toBe(
      piece.start,
    );
    expect(state.slots).toHaveLength(2);
  });
  it("inserts a repeat before the selected slot without dropping following slots", () => {
    const state: WorkspaceState = {
      chops: [piece],
      cuts: [],
      slots: [
        { kind: "chop", chop: 0, steps: 2 },
        { kind: "silence", steps: 4 },
        { kind: "chop", chop: 0, steps: 8 },
      ],
    };
    const repeated = repeatPrevious(state, 1, grid, 10000, 4, 7);
    expect(repeated.slots[1].steps).toBe(4);
    expect(repeated.slots[2]).toEqual(state.slots[1]);
    expect(repeated.slots[3]).toEqual(state.slots[2]);
    expect(
      repeated.slots[1].kind === "chop" && repeated.slots[1].alignedStart,
    ).toBe(7);
  });
  it("appends at the end when no earlier slot is selected", () => {
    const state: WorkspaceState = { chops: [], slots: [], cuts: [] };
    expect(placeCandidate(state, piece).slots).toEqual([
      { kind: "chop", chop: 0, steps: 8 },
    ]);
  });
});

describe("quantized backwards editing", () => {
  const chop = (steps: number) => ({ kind: "chop" as const, chop: 0, steps });
  it("trims an eighth by exactly one selected sixteenth without mutating confirmed history", () => {
    const slots = [chop(16), chop(2)];
    expect(trimPrevious(slots, 1)).toEqual([chop(16), chop(1)]);
    expect(slots[1].steps).toBe(2);
    expect(trimPrevious(slots, 2)).toEqual([chop(16)]);
  });
  it("retains fractional triplet durations while trimming", () => {
    expect(trimPrevious([chop(2 / 3)], 1 / 6)[0].steps).toBe(0.5);
  });
  it("rewinds across several pieces and silence, splitting a piece at the bar boundary", () => {
    const slots = [
      chop(12),
      chop(6),
      { kind: "silence" as const, steps: 1 },
      chop(2),
    ];
    expect(rewindLastBar(slots, 4)).toEqual([chop(12), chop(4)]);
    expect(slots[1].steps).toBe(6);
  });
  it("rewinds a completed bar to its own beginning and respects other meters", () => {
    expect(rewindLastBar([chop(16), chop(16)], 4)).toEqual([chop(16)]);
    expect(rewindLastBar([chop(4)], 4)).toEqual([]);
    expect(rewindLastBar([chop(13)], 3)).toEqual([chop(12)]);
  });
});

describe("preview and packed Koala audio", () => {
  const data = [
    Float32Array.from({ length: 10000 }, (_, i) => Math.sin(i * 0.04)),
    Float32Array.from({ length: 10000 }, (_, i) => Math.cos(i * 0.03)),
  ];
  it("preserves the grid duration and fades every channel without changing the original source", () => {
    const before = data[0].slice();
    const audio = pieceAudio(data, piece, 3, 500, 1000);
    expect(audio[0]).toHaveLength(375);
    for (const channel of audio) {
      expect(Math.abs(channel[0])).toBe(0);
      expect(Math.abs(channel.at(-1)!)).toBe(0);
    }
    expect(data[0]).toEqual(before);
  });
  it("packs overlapping pieces independently, reuses repeated choices, and leaves silence as a note gap", () => {
    const other = { ...piece, start: piece.start + 250 };
    const packed = packArrangement(
      data,
      [piece, other],
      [
        { kind: "chop", chop: 0, steps: 8 },
        { kind: "silence", steps: 4 },
        { kind: "chop", chop: 1, steps: 8 },
        { kind: "chop", chop: 0, steps: 8 },
      ],
      500,
      1000,
    );
    expect(packed.layout.starts).toEqual([0, 1000]);
    expect(packed.notes).toEqual([
      { slice: 0, start: 0, steps: 8 },
      { slice: 1, start: 12, steps: 8 },
      { slice: 0, start: 20, steps: 8 },
    ]);
    expect(packed.channelData[0].subarray(0, 1000)).toEqual(
      pieceAudio(data, piece, 8, 500, 1000, { fadeOut: 0.005 })[0],
    );
    expect(packed.channelData[1].subarray(1000)).toEqual(
      pieceAudio(data, other, 8, 500, 1000, { fadeIn: 0.003 })[1],
    );
  });
  it("uses short asymmetric envelopes around silence without shortening notes", () => {
    const constant = [new Float32Array(10000).fill(1)];
    const out = pieceAudio(constant, piece, 8, 500, 1000, {
      fadeOut: 0.005,
    })[0];
    const incoming = pieceAudio(constant, piece, 8, 500, 1000, {
      fadeIn: 0.003,
    })[0];
    expect(out.length).toBe(1000);
    expect(out[996]).toBeCloseTo(0.6);
    expect(out[999]).toBe(0);
    expect(incoming[0]).toBe(0);
    expect(incoming[1]).toBeCloseTo(1 / 3);
    expect(incoming[3]).toBe(1);
    expect(constant[0][piece.start]).toBe(1);
  });
  it("supports silence-only sequences and more than 127 unique pieces", () => {
    const silent = packArrangement(
      data,
      [],
      [{ kind: "silence", steps: 4 }],
      500,
      1000,
    );
    expect(silent.layout.starts).toEqual([0]);
    expect(silent.notes).toEqual([]);
    const many = Array.from({ length: 128 }, (_, i) => ({
      ...piece,
      start: i * 5,
    }));
    expect(
      packArrangement(
        data,
        many,
        many.map((_, chop) => ({ kind: "chop", chop, steps: 1 })),
        500,
        1000,
      ).layout.starts,
    ).toHaveLength(128);
  });
});
