import { DEFAULT_KEYBOARD_OPTIONS } from "./keyboard";
import JSZip from "jszip";
import { expect, it } from "vitest";
import { saveArrangementToKoala, readArrangementFromKoala } from "./project";
it("stores the playable master and editable lanes together in the Koala archive", async () => {
  const zip = new JSZip(); zip.file("samples/source.wav", new Uint8Array([1, 2, 3]));
  const arrangement = { lanes: [{ id: "keys", pianoPad: 17, muted: false, keyboard: { ...DEFAULT_KEYBOARD_OPTIONS, mono: true, glide: true, glideSeconds: 0.4 } }], sections: [{ bars: 4, patterns: { keys: { bars: 2, notes: [{ pad: 17, tick: 0, length: 4096, pitch: 7, velocity: 90, gate: true }] } } }] };
  await saveArrangementToKoala(zip, arrangement, 4, 0);
  const reopened = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }));
  expect((await readArrangementFromKoala(reopened))?.arrangement).toEqual(arrangement);
  const native = JSON.parse(await reopened.file("sequence.json")!.async("string"));
  expect(native.sequences[0].noteSequence.pattern).toMatchObject({ numBars: 4, notes: [{ num: 17, pitch: 7, timeOffset: 0 }, { num: 17, pitch: 7, timeOffset: 32768 }] });
  expect(Array.from(await reopened.file("samples/source.wav")!.async("uint8array"))).toEqual([1, 2, 3]);
});
