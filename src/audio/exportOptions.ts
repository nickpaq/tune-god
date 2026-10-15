import type { CategoryId } from "./classify";
import { balancedSpread } from "./spread";
import type { MasterStyle } from "./mixPresets";

/** What the export does for the user, chosen with check boxes each time they export (and remembered). */
export interface ExportOptions {
  /** Normalize and balance sounds by perceived loudness: peak-normalized files, each pad's volume knob set by its type's target loudness, and the per-type pad EQ. */
  normalize: boolean;
  /** Write the app's colours and labels onto the pads. Off, pads keep the colour and label the project gave them. */
  colorsAndLabels: boolean;
  /** Add the Koala FX master chain (`masterStyle` picks which). */
  masterChain: boolean;
  masterStyle: MasterStyle;
  /** Route pads to Koala's buses by sound type, rename the buses, and put the kick clipper and melodic EQ on them. */
  buses: boolean;
  /** One pattern per melodic loop (see loopPatterns.ts). Off, patterns made by an earlier export are removed. */
  melodicPatterns: boolean;
  /** Spread hats and melodic sounds across the stereo field. */
  panSpread: boolean;
  /** Fade every 808 in over the length of the kick's main transient (rendered into the file), so the kick hits through. Needs a kick and a bass or 808 on the pads. */
  fade808: boolean;
  /** Set mute groups by sound type (open and closed hats, 808s and basses, melodic loops cut each other off). Off, pads keep their own. */
  chokeGroups: boolean;
}

/** Sounds come out as they went in, apart from the app's labels and colours, the type's mute groups and the melodic loop patterns. */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  normalize: false,
  colorsAndLabels: true,
  masterChain: false,
  masterStyle: "dynamic",
  buses: false,
  melodicPatterns: true,
  panSpread: false,
  fade808: false,
  chokeGroups: true,
};

/** Widest pan either side of centre, in percent, per group (hats stay narrower than the melodic sounds). */
export const PAN_SPREAD_PERCENT = { hats: 30, melodic: 40 } as const;

const PAN_GROUPS: { group: keyof typeof PAN_SPREAD_PERCENT; categories: CategoryId[] }[] = [
  { group: "hats", categories: ["closedHat", "openHat"] },
  { group: "melodic", categories: ["melodic", "melodicLoop"] },
];

/**
 * Koala pan (0 to 1, 0.5 = centre) for each sound's pad: hats are spread among themselves and the melodic sounds among themselves, each pair
 * mirrored left and right (see balancedSpread). Everything else stays centred and is left out. Sounds that share a sample share its pan.
 */
export function panPlan(pads: { sampleId: number; category?: CategoryId }[], random: () => number = Math.random): Map<number, number> {
  const pans = new Map<number, number>();
  for (const { group, categories } of PAN_GROUPS) {
    const ids = [...new Set(pads.filter((p) => p.category && categories.includes(p.category)).map((p) => p.sampleId))];
    const offsets = balancedSpread(ids.length, PAN_SPREAD_PERCENT[group], random);
    ids.forEach((id, i) => pans.set(id, 0.5 + offsets[i] / 200));
  }
  return pans;
}

/** Saved choices may be missing fields (older saves): anything missing takes the default. */
export function mergeExportOptions(saved?: Partial<ExportOptions> | null): ExportOptions {
  return { ...DEFAULT_EXPORT_OPTIONS, ...(saved ?? {}) };
}
