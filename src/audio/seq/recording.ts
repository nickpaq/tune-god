import type { SeqPattern, SeqNote } from "./model";

export interface RecordingHistory { completedPasses: string[]; }
/** Append an overdub without replacing earlier notes or changing the pattern length. */
export function completeRecordingPass(pattern: SeqPattern, notes: SeqNote[], passId: string, history: RecordingHistory): { pattern: SeqPattern; history: RecordingHistory } {
  if (!notes.length) return { pattern, history };
  if (!passId || history.completedPasses.includes(passId) || pattern.notes.some(note => note.recordingPass === passId)) throw new Error("Recording pass must have a unique ID");
  return {
    pattern: { ...pattern, notes: [...pattern.notes, ...notes.map(note => ({ ...note, recordingPass: passId }))].sort((a, b) => a.tick - b.tick) },
    history: { completedPasses: [...history.completedPasses, passId] },
  };
}
/** Remove only notes from the last completed pass, preserving all unrelated edits. */
export function undoRecordingPass(pattern: SeqPattern, history: RecordingHistory): { pattern: SeqPattern; history: RecordingHistory } {
  const passId = history.completedPasses.at(-1);
  if (!passId) return { pattern, history };
  return { pattern: { ...pattern, notes: pattern.notes.filter(note => note.recordingPass !== passId) }, history: { completedPasses: history.completedPasses.slice(0, -1) } };
}

/** Discard notes belonging to an active take without restoring an old pattern snapshot. */
export function discardRecordingTake(pattern: SeqPattern, activeTakeId: string): SeqPattern {
  return { ...pattern, notes: pattern.notes.filter(note => note.recordingPass !== activeTakeId) };
}

export interface RecordingTransport { playing: boolean; recording: boolean; take: number; }
export function recordingTransportAction(state: RecordingTransport, action: "play" | "record" | "undo"): RecordingTransport {
  if (action === "play") return state.recording ? { ...state, playing: true, recording: false } : { ...state, playing: !state.playing };
  if (action === "undo") return state.recording ? { ...state, playing: true, take: state.take + 1 } : state;
  return state.recording ? state : { playing: true, recording: true, take: state.take + 1 };
}
