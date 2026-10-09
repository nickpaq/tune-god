import { expect, it } from "vitest";
import { completeRecordingPass, undoRecordingPass, discardRecordingTake, recordingTransportAction } from "./recording";
it("undoes a completed overdub while retaining preceding notes and subsequent non-recording edits", () => {
  const note = { pad: 0, tick: 0, length: 1024, pitch: 0, velocity: 100 };
  const first = completeRecordingPass({ bars: 1, notes: [note] }, [{ ...note, pad: 1 }], "first", { completedPasses: [] });
  const second = completeRecordingPass(first.pattern, [{ ...note, pad: 2 }], "second", first.history);
  const edited = { ...second.pattern, bars: 4, notes: [...second.pattern.notes, { ...note, pad: 3 }] };
  const undone = undoRecordingPass(edited, second.history);
  expect(undone.pattern.bars).toBe(4);
  expect(undone.pattern.notes.map(n => n.pad)).toEqual([0, 1, 3]);
  expect(undoRecordingPass(undone.pattern, undone.history).pattern.notes.map(n => n.pad)).toEqual([0, 3]);
});
it("does not turn an empty recording pass into an undo action", () => {
  const pattern = { bars: 1, notes: [] }; const history = { completedPasses: [] };
  expect(completeRecordingPass(pattern, [], "empty", history)).toEqual({ pattern, history });
});

it("can discard an active take without changing previous notes or pattern edits", () => {
  const note = { pad: 0, tick: 0, length: 1024, pitch: 0, velocity: 100 };
  const pattern = { bars: 8, notes: [note, { ...note, pad: 1, recordingPass: "active" }, { ...note, pad: 2, recordingPass: "previous" }] };
  const discarded = discardRecordingTake(pattern, "active");
  expect(discarded.bars).toBe(8);
  expect(discarded.notes.map(n => n.pad)).toEqual([0, 2]);
  expect(pattern.notes).toHaveLength(3);
});

it("restarts the take on Undo and keeps playback running when Play commits it", () => {
  const initial = { playing: false, recording: false, take: 0 };
  const recording = recordingTransportAction(initial, "record");
  expect(recording).toEqual({ playing: true, recording: true, take: 1 });
  const undone = recordingTransportAction(recording, "undo");
  expect(undone).toEqual({ playing: true, recording: true, take: 2 });
  expect(recordingTransportAction(undone, "play")).toEqual({ playing: true, recording: false, take: 2 });
});
