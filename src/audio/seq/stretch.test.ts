import { expect, it } from "vitest";
import { stretchBeats, renderStretch } from "./stretch";
it("stretches short audio to all sixteen bars without duration clamping", () => {
  const input = Float32Array.from(
    { length: 800 },
    (_, i) => 0.3 * Math.sin((i * 2 * Math.PI * 220) / 8000),
  );
  const result = renderStretch([input], 8000, 32, "modern");
  expect(result[0].length).toBe(256000);
  expect(result[0].every(Number.isFinite)).toBe(true);
  expect(input.length).toBe(800);
});
it("Beats preserves attacks at their scaled positions and stereo alignment", () => {
  const input = new Float32Array(8000);
  input[0] = 1;
  input[4000] = 0.5;
  const [a, b] = stretchBeats(
    [input, Float32Array.from(input, (x) => x * 0.5)],
    8000,
    2,
  );
  expect(a.length).toBe(16000);
  expect(a[0]).toBe(1);
  expect(a[8000]).toBe(0.5);
  expect(b[8000]).toBe(0.25);
});
