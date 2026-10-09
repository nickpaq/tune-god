import type { MakerChop, Slot } from "../audio/song/patternMaker";
import type { TapGrid } from "../audio/song/tapGrid";
import type { WorkspaceResult } from "../audio/song/sectionWorkspace";
import { SectionWorkspace } from "./SectionWorkspace";

export function PatternMaker(props: {
  channelData: Float32Array[];
  sampleRate: number;
  chops: MakerChop[];
  beatsPerBar: number;
  beatFrames: number;
  initial: Slot[];
  colors: readonly string[];
  grid?: TapGrid;
  pitch?: number;
  onDone: (result: WorkspaceResult) => void | Promise<void>;
  onClose: () => void;
}) {
  return <SectionWorkspace {...props} />;
}
