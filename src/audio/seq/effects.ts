export interface PadFilters { highPassHz: number; lowPassHz: number; order?: 4 | 8; colour?: number; bitReduction?: boolean; warmth?: boolean; }
export const DEFAULT_PAD_FILTERS: PadFilters = { highPassHz: 0, lowPassHz: 0, order: 8, colour: 0, bitReduction: false, warmth: false };
export interface MasterClipperSettings { enabled: boolean; driveDb: number; outputDb: number; }
export const DEFAULT_MASTER_CLIPPER: MasterClipperSettings = { enabled: false, driveDb: 0, outputDb: 0 };
export function softClipCurve(size = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) { const x = i * 2 / (size - 1) - 1; curve[i] = Math.tanh(x); }
  return curve;
}
/** Q values of cascaded second-order sections for a unity-gain Butterworth response. */
export function butterworthSectionQs(order: 4 | 8): number[] {
  return Array.from({ length: order / 2 }, (_, k) => 1 / (2 * Math.cos((2 * k + 1) * Math.PI / (2 * order))));
}
/** A controllable 12-bit/drive texture; this is not a proprietary RX950 emulation. */
export function samplerColourCurve(amount: number, bitReduction = true, warmth = true, size = 65537): Float32Array<ArrayBuffer> {
  const mix = Math.max(0, Math.min(1, amount));
  const drive = 1 + 2 * mix;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = i * 2 / (size - 1) - 1;
    const warmed = warmth ? Math.tanh(x * drive) / Math.tanh(drive) : x;
    const coloured = bitReduction ? Math.round(warmed * 2047) / 2047 : warmed;
    curve[i] = x * (1 - mix) + coloured * mix;
  }
  return curve;
}
export function connectPadFilters(ctx: BaseAudioContext, input: AudioNode, output: AudioNode, settings: PadFilters) {
  const nodes: AudioNode[] = [];
  let tail = input;
  for (const [type, hz] of [["highpass", settings.highPassHz], ["lowpass", settings.lowPassHz]] as const) {
    if (hz <= 0) continue;
    for (const q of butterworthSectionQs(settings.order ?? 8)) {
      const filter = ctx.createBiquadFilter(); filter.type = type;
      filter.frequency.value = Math.max(10, Math.min(ctx.sampleRate * 0.49, hz));
      // Web Audio expresses low/high-pass Q in decibels, not linear Q.
      filter.Q.value = 20 * Math.log10(q);
      tail.connect(filter); tail = filter; nodes.push(filter);
    }
  }
  if ((settings.colour ?? 0) > 0 && (settings.bitReduction || settings.warmth)) {
    const colour = ctx.createWaveShaper();
    colour.curve = samplerColourCurve(settings.colour!, !!settings.bitReduction, !!settings.warmth);
    colour.oversample = "none";
    tail.connect(colour); tail = colour; nodes.push(colour);
  }
  tail.connect(output);
  return { disconnect: () => nodes.forEach(node => node.disconnect()) };
}
/** One bus shared by all sequencer banks and independent piano lanes. */
export function createMasterClipper(ctx: BaseAudioContext, output: AudioNode, settings = DEFAULT_MASTER_CLIPPER) {
  const input = ctx.createGain(), drive = ctx.createGain(), shape = ctx.createWaveShaper(), wet = ctx.createGain(), dry = ctx.createGain(), level = ctx.createGain();
  shape.curve = softClipCurve(); shape.oversample = "4x";
  input.connect(drive).connect(shape).connect(wet).connect(level);
  input.connect(dry).connect(level); level.connect(output);
  const update = (next: MasterClipperSettings) => {
    drive.gain.setTargetAtTime(10 ** (Math.max(0, Math.min(24, next.driveDb)) / 20), ctx.currentTime, 0.01);
    wet.gain.setTargetAtTime(next.enabled ? 1 : 0, ctx.currentTime, 0.01);
    dry.gain.setTargetAtTime(next.enabled ? 0 : 1, ctx.currentTime, 0.01);
    level.gain.setTargetAtTime(10 ** (Math.max(-24, Math.min(6, next.outputDb)) / 20), ctx.currentTime, 0.01);
  };
  // Set initial values immediately to avoid mixing dry and wet on the first hit.
  drive.gain.value = 10 ** (Math.max(0, Math.min(24, settings.driveDb)) / 20);
  wet.gain.value = settings.enabled ? 1 : 0; dry.gain.value = settings.enabled ? 0 : 1;
  level.gain.value = 10 ** (Math.max(-24, Math.min(6, settings.outputDb)) / 20);
  return { input, update, disconnect: () => [input, drive, shape, wet, dry, level].forEach(node => node.disconnect()) };
}

/** Render a new buffer for export; leave source audio untouched for subsequent editing. */
export async function renderPadFilters(channelData: Float32Array[], sampleRate: number, settings: PadFilters): Promise<Float32Array[]> {
  if (!channelData.length || !channelData[0].length) throw new Error("No sample audio");
  if (channelData.some(channel => channel.length !== channelData[0].length)) throw new Error("Sample channel lengths differ");
  if (settings.highPassHz <= 0 && settings.lowPassHz <= 0 && ((settings.colour ?? 0) <= 0 || (!settings.bitReduction && !settings.warmth))) return channelData.map(channel => channel.slice());
  const ctx = new OfflineAudioContext(channelData.length, channelData[0].length, sampleRate);
  const buffer = ctx.createBuffer(channelData.length, channelData[0].length, sampleRate);
  channelData.forEach((channel, i) => buffer.getChannelData(i).set(channel));
  const source = ctx.createBufferSource(); source.buffer = buffer;
  const filters = connectPadFilters(ctx, source, ctx.destination, settings);
  source.start();
  try {
    const rendered = await ctx.startRendering();
    return Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i).slice());
  } finally { source.disconnect(); filters.disconnect(); }
}
