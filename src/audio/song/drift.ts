// Finds where the tapped grid stops agreeing with the audio. A grid line is confirmed when there is a clear attack (a kick, a snare, a hit) close to it;
// where the song speeds up or slows a little, or a part has nothing to hold the beat, the lines stop being confirmed, and a nudge or a snap to the
// nearest transient cannot say which attack belongs to which line. The line after which that starts is where the user should tap again.
import { lineFrame, linesBetween, type TapGrid } from "./tapGrid";

/** Frames per block of the envelope (about 3 ms at 44.1 kHz). */
const HOP = 128;
/** A line is checked for an attack this far either side, as a share of a beat. */
const SEARCH_BEATS = 0.25;
/** The attack counts as clear when its rise is at least this many times the usual level around the line. */
const CLEAR_RATIO = 1.5;
/** A clear attack confirms the line when it is within this share of a beat, and at least this many seconds, of it. */
const TOLERANCE_BEATS = 0.06;
const MIN_TOLERANCE_S = 0.02;
/** Lines checked together, how far each step moves on, and how many of them must be confirmed for the stretch to be sound. */
const WINDOW = 8;
const STEP = 4;
const SOUND = 5;
/** Unsound stretches in a row that make a drift (one can be a fill). */
const UNSOUND_RUN = 2;

export interface AttackEnvelope {
  hop: number;
  /** Mean level per block. */
  energy: Float32Array;
  /** The rise in level at the start of each block: what comes after it less what came before. */
  rise: Float32Array;
}

/** The song's attacks as an envelope, worked out once. */
export function attackEnvelope(mono: Float32Array, hop = HOP): AttackEnvelope {
  const blocks = Math.floor(mono.length / hop);
  const energy = new Float32Array(blocks);
  for (let b = 0; b < blocks; b++) {
    let sum = 0;
    for (let i = b * hop; i < (b + 1) * hop; i++) sum += Math.abs(mono[i]);
    energy[b] = sum / hop;
  }
  const rise = new Float32Array(blocks);
  for (let b = 2; b < blocks - 1; b++) rise[b] = energy[b] + energy[b + 1] - energy[b - 2] - energy[b - 1];
  return { hop, energy, rise };
}

export interface LineCheck {
  /** An attack stands out clearly near the line. */
  clear: boolean;
  /** Frames from the line to that attack. */
  offset: number;
}

/** Looks for the sharpest attack within a quarter of a beat of `frame`. */
export function checkLine(env: AttackEnvelope, frame: number, beatFrames: number): LineCheck {
  const { hop, energy, rise } = env;
  const reach = Math.ceil((SEARCH_BEATS * beatFrames) / hop);
  const centre = Math.round(frame / hop);
  let best = -Infinity;
  let at = centre;
  for (let b = Math.max(2, centre - reach); b <= Math.min(rise.length - 2, centre + reach); b++) {
    if (rise[b] > best) {
      best = rise[b];
      at = b;
    }
  }
  if (best === -Infinity) return { clear: false, offset: 0 };
  // The usual level around the line, a beat either side, to tell an attack from a busy part.
  const around = Math.ceil(beatFrames / hop);
  let sum = 0;
  let count = 0;
  for (let b = Math.max(0, centre - around); b <= Math.min(energy.length - 1, centre + around); b++) {
    sum += energy[b];
    count++;
  }
  const usual = count > 0 ? sum / count : 0;
  return { clear: best >= CLEAR_RATIO * usual && best > 1e-5, offset: at * hop - frame };
}

/**
 * The lines after which the grid stops being confirmed by the audio: the last confirmed line of a sound stretch of the song, when the stretches
 * after it are not sound (`UNSOUND_RUN` in a row). A song that never has a confirmed stretch (nothing to hold the beat from the start) gives none.
 * After a drift is marked, the next marker waits for a sound stretch to be found again.
 */
export function findDriftMarkers(env: AttackEnvelope, grid: TapGrid, totalFrames: number): number[] {
  const lines = linesBetween(grid, 0, totalFrames);
  if (lines.length < WINDOW) return [];
  const confirmed = lines.map((n) => {
    const frame = lineFrame(grid, n);
    // The spacing here, from the neighbouring line.
    const beat = Math.abs(lineFrame(grid, n + 1) - frame);
    const check = checkLine(env, frame, beat);
    return check.clear && Math.abs(check.offset) <= Math.max(TOLERANCE_BEATS * beat, MIN_TOLERANCE_S * grid.sampleRate);
  });
  const markers: number[] = [];
  let seenSound = false;
  let lastConfirmed = -1;
  let unsound = 0;
  for (let from = 0; from + WINDOW <= lines.length; from += STEP) {
    let count = 0;
    for (let i = from; i < from + WINDOW; i++) if (confirmed[i]) count++;
    if (count >= SOUND) {
      seenSound = true;
      unsound = 0;
      for (let i = from + WINDOW - 1; i >= from; i--) {
        if (confirmed[i]) {
          lastConfirmed = i;
          break;
        }
      }
    } else if (seenSound && ++unsound === UNSOUND_RUN) {
      markers.push(lines[lastConfirmed]);
      seenSound = false;
      unsound = 0;
    }
  }
  return markers;
}
