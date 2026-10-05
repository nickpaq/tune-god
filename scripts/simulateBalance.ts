// Runs the app's loudness balancer over the mix calibration sounds with trims from the command line and prints each pad's output
// level, so a trim change can be judged without exporting. Usage: npx tsx scripts/simulateBalance.ts [type=trimDb ...]
// Also crest.<type>=<dB> and bonus.<type>=<dB> to try the peak-room and lift settings of the preset.
// Example: npx tsx scripts/simulateBalance.ts closedHat=-5 cymbal=-6 crest.closedHat=0 bonus.kick=4
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { balanceStats, balanceFromStats, FILE_CEILING_DB, CATEGORY_TRIM_DB } from "../src/audio/loudness";
import { ACTIVE_MIX_PRESET } from "../src/audio/mixPresets";
import type { CategoryId } from "../src/audio/classify";
import { categoryOfFile } from "../src/audio/samplePack";

function readWav24(buf: Uint8Array): { data: Float32Array; rate: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rate = dv.getUint32(24, true);
  const bytes = dv.getUint16(34, true) / 8;
  const n = Math.floor((buf.byteLength - 44) / bytes);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = 44 + i * bytes;
    let v = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
    if (v & 0x800000) v -= 0x1000000;
    out[i] = v / 8388608;
  }
  return { data: out, rate };
}

const zip = await JSZip.loadAsync(readFileSync(new URL("../docs/calibration/mix-calibration.koala", import.meta.url)));
const sampler = JSON.parse(await zip.file("sampler/sampler.json")!.async("string"));
const overrides = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")).map(([k, v]) => [k, Number(v)]));
for (const [key, v] of Object.entries(overrides)) {
  if (key.startsWith("crest.")) (ACTIVE_MIX_PRESET.loudness.crestBonusDb as Record<string, number>)[key.slice(6)] = v;
  else if (key.startsWith("bonus.")) (ACTIVE_MIX_PRESET.loudness.bonusDb as Record<string, number>)[key.slice(6)] = v;
  else (CATEGORY_TRIM_DB as Record<string, number>)[key] = v;
}
const rows: { name: string; stats: ReturnType<typeof balanceStats> }[] = [];
for (const s of sampler.samples) {
  const wav = readWav24(await zip.file(`sampler/${s.id}.wav`)!.async("uint8array"));
  const name: string = s.metadata.originalPath;
  const category = categoryOfFile([], name) as CategoryId;
  rows.push({ name, stats: balanceStats({ channelData: [wav.data], sampleRate: wav.rate, category }) });
}
const bal = balanceFromStats(rows.map((r) => r.stats), FILE_CEILING_DB);
console.log("pad".padEnd(36), "category".padEnd(12), "trim", " out peak dB", " out loudness LUFS");
rows.forEach((r, i) => {
  const peak = r.stats.peakDb + bal.gainDb[i] + bal.knobDb[i];
  const loud = (r.stats.loud ?? NaN) + bal.gainDb[i] + bal.knobDb[i];
  console.log(r.name.padEnd(36), String(r.stats.category).padEnd(12), String(bal.knobDb[i]).padStart(4), peak.toFixed(2).padStart(10), loud.toFixed(1).padStart(14));
});
