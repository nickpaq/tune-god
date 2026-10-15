import { expect, it } from "vitest";
import { planKit, placeBank } from "./bankLoad";
import { layoutById } from "./fingerLayouts";
import { is808Name } from "./classify";
import type { PackFile } from "./samplePack";

const f = (folders: string[], name: string): PackFile<null> => ({ folders, name, size: 1000, source: null });

it("a kit selection with no kicks puts 808s on the two kick pads (bottom-left and above)", () => {
  const files = [
    ...Array.from({ length: 20 }, (_, i) => f(["Pack", "Bass"], `bass-${i}.wav`)),
    ...Array.from({ length: 5 }, (_, i) => f(["Pack", "808s"], `808-${i}.wav`)),
    ...Array.from({ length: 6 }, (_, i) => f(["Pack", "Snares"], `snare-${i}.wav`)),
  ];
  const plan = planKit(files, () => 0.5);
  const sounds = plan.groups.flatMap((g) => g.candidates.slice(0, g.want).map((c) => ({ c, g })))
    .map(({ c, g }, key) => ({ key, category: g.category, is808: [...c.folders, c.name].some(is808Name) || undefined, name: c.name }));
  const placed = placeBank("kit", sounds, layoutById(null));
  const at = (pad: number) => sounds.find((s) => placed.positions.get(s.key) === pad)?.name;
  expect(at(12)).toMatch(/^808-/);
  expect(at(8)).toMatch(/^808-/);
});
