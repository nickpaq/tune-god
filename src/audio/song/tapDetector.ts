// Finds taps in a microphone signal: a knock on the back of the phone is a short, sharp click, far louder at the microphone than the song coming
// from the speaker. The signal is high-passed (a knock is broadband, a room and a bassline are not), followed for its level, and a tap is a level
// that jumps well above what the last half second has been like and above a floor. Pure arithmetic over blocks of samples, so it can be tested.

/** The signal below this frequency (Hz) is ignored. */
const HIGH_PASS_HZ = 600;
/** How long the level follower takes to fall after a click (seconds). */
const LEVEL_DECAY_S = 0.006;
/** How long the background follower takes to settle on what the sound is usually like (seconds). */
const BACKGROUND_S = 0.5;
/** Nothing counts as a tap until the sound has been listened to for this long (seconds). */
const WARM_UP_S = 0.1;
/** A second tap this soon (seconds) after one is the same knock ringing. */
const REFRACTORY_S = 0.12;

export interface TapDetectorOptions {
  /** 0 to 1: how little it takes to count as a tap. Higher is more sensitive. */
  sensitivity?: number;
}

/** The jump over the background (a ratio) and the quietest level (full scale) that counts as a tap, for a sensitivity. */
export function thresholds(sensitivity: number): { ratio: number; floor: number } {
  const s = Math.min(1, Math.max(0, sensitivity));
  return { ratio: 8 - 5.5 * s, floor: 0.2 * 0.02 ** s };
}

export class TapDetector {
  private readonly rate: number;
  private readonly decay: number;
  private readonly hpCoef: number;
  private ratio: number;
  private floor: number;
  private lastIn = 0;
  private lastOut = 0;
  private level = 0;
  private background = 0;
  /** Samples heard so far (up to the background's own time span): the background is a plain average until then, so it is right from the first moment. */
  private heard = 0;
  /** Samples since the last tap. */
  private since = Infinity;
  /** The loudest level in the block just processed, for a meter. */
  peak = 0;

  constructor(sampleRate: number, options: TapDetectorOptions = {}) {
    this.rate = sampleRate;
    this.decay = Math.exp(-1 / (LEVEL_DECAY_S * sampleRate));
    this.hpCoef = Math.exp((-2 * Math.PI * HIGH_PASS_HZ) / sampleRate);
    const { ratio, floor } = thresholds(options.sensitivity ?? 0.5);
    this.ratio = ratio;
    this.floor = floor;
  }

  setSensitivity(sensitivity: number): void {
    const { ratio, floor } = thresholds(sensitivity);
    this.ratio = ratio;
    this.floor = floor;
  }

  /** Feeds the next block; returns the index in the block of the first sample of every tap that began in it. */
  process(block: Float32Array): number[] {
    const taps: number[] = [];
    let peak = 0;
    for (let i = 0; i < block.length; i++) {
      // One-pole high-pass.
      const x = block[i];
      const y = this.hpCoef * (this.lastOut + x - this.lastIn);
      this.lastIn = x;
      this.lastOut = y;
      const a = Math.abs(y);
      this.level = a > this.level ? a : this.level * this.decay;
      if (this.level > peak) peak = this.level;
      this.since++;
      if (this.heard < BACKGROUND_S * this.rate) this.heard++;
      if (this.heard > WARM_UP_S * this.rate && this.since > REFRACTORY_S * this.rate && this.level > this.floor && this.level > this.ratio * this.background) {
        taps.push(i);
        this.since = 0;
      }
      // The background follows the level slowly, and is not dragged up by a tap's own click while it rings.
      if (this.since > REFRACTORY_S * this.rate) this.background += (this.level - this.background) / this.heard;
    }
    this.peak = peak;
    return taps;
  }
}
