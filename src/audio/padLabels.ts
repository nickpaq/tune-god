// Display labels for pads. The nine categories stay the only thing tuning, buses and loudness look at; this only
// decides the words shown on a pad in the app and written to it in Koala. Drums use their finer role (Open Hat, Tom),
// other sounds use a filename keyword when there is one (Piano, Riser, Vox), and everything else falls back to the category.
import { categoryLabel, type CategoryId } from "./classify";
import { effectiveRole, ROLE_LABEL, type DrumRole } from "./drumRoles";

/** A finer label for a non-drum sound, tied to the category it was worked out for. */
export interface Detail {
  category: CategoryId;
  text: string;
}

// First match wins within a category, so specific words come before generic ones.
const DETAIL_RULES: Partial<Record<CategoryId, [string, RegExp][]>> = {
  bass: [
    ["808", /\b808\b/],
    ["Sub", /\bsub\b/],
    ["Reese", /\breese\b/],
    ["Bass", /\bbass\b/],
  ],
  melodic: [
    ["Piano", /\b(piano|rhodes|epiano)\b/],
    ["Keys", /\b(keys|key)\b/],
    ["Organ", /\borgan\b/],
    ["Guitar", /\bguitar\b/],
    ["Strings", /\b(strings|string|harp)\b/],
    ["Brass", /\b(brass|horn)\b/],
    ["Flute", /\bflute\b/],
    ["Bell", /\b(bell|bells|glock|glockenspiel|celesta|chime|vibraphone|kalimba|marimba|mallet)\b/],
    ["Pluck", /\bpluck\b/],
    ["Stab", /\bstab\b/],
    ["Arp", /\barp\b/],
    ["Chord", /\b(chord|chords)\b/],
    ["Lead", /\blead\b/],
    ["Pad", /\bpad\b/],
    ["Synth", /\b(synth|saw)\b/],
  ],
  vocal: [
    ["Choir", /\b(choir|chant)\b/],
    ["Ad-lib", /\b(adlib|ad lib)\b/],
    ["Acapella", /\bacapella\b/],
    ["Vox", /\b(vox|vocal|vocals|voice)\b/],
  ],
  fx: [
    ["Riser", /\b(riser|uplifter|swell)\b/],
    ["Downlifter", /\bdownlifter\b/],
    ["Sweep", /\bsweep\b/],
    ["Impact", /\bimpact\b/],
    ["Whoosh", /\bwhoosh\b/],
    ["Transition", /\btransition\b/],
    ["Glitch", /\bglitch\b/],
    ["Foley", /\bfoley\b/],
    ["Noise", /\bnoise\b/],
    ["Texture", /\b(texture|ambience|ambient|atmos|drone)\b/],
  ],
  other: [
    ["Break", /\b(break|breakbeat|amen)\b/],
    ["Loop", /\bloop\b/],
  ],
};

function normalize(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-.()[\]]+/g, " ")
    .toLowerCase();
}

/** Keyword label for a sound of this category, or undefined when its file name has none (drums use roles instead). */
export function classifyDetail(fileName: string, category: CategoryId): Detail | undefined {
  const name = normalize(fileName);
  for (const [text, re] of DETAIL_RULES[category] ?? []) if (re.test(name)) return { category, text };
  return undefined;
}

/** What a pad is called. A stored detail or role only counts while it still agrees with the pad's category. */
export function padLabel(pad: { category?: CategoryId; drumRole?: DrumRole; detail?: Detail }): string {
  const category = pad.category ?? "other";
  const role = effectiveRole(category, pad.drumRole);
  if (role) return ROLE_LABEL[role];
  if (pad.detail && pad.detail.category === category) return pad.detail.text;
  return categoryLabel(category);
}
