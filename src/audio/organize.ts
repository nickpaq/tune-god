// The Organize step for a loaded Koala project. A project does not keep the folders its sounds came from, so only the file names are
// left to go on. Obvious names ("Kick 03", "Snare Tight", "OH 2") settle a sound's type; the sounds whose names say nothing are put to
// the user one at a time (see the focus mode in App.tsx).
import type { CategoryId } from "./classify";
import { categoryOfFile } from "./samplePack";

export interface OrganizeInput {
  /** Any stable key for the sound (its original pad slot). */
  key: number;
  /** The sound's file name. */
  name: string;
  /** The type is already known from elsewhere (a sample pack's folders), so the sound is left alone. */
  known?: boolean;
}

export interface OrganizePlan {
  /** Sounds whose file name names their type, by key. */
  byName: Map<number, CategoryId>;
  /** Sounds whose name says nothing, in the order given: these are asked about. */
  ask: number[];
}

export function planOrganize(sounds: OrganizeInput[]): OrganizePlan {
  const byName = new Map<number, CategoryId>();
  const ask: number[] = [];
  for (const s of sounds) {
    if (s.known) continue;
    const category = categoryOfFile([], s.name);
    if (category === "other") ask.push(s.key);
    else byName.set(s.key, category);
  }
  return { byName, ask };
}
