// The maths of dragging a chop point, Ableton style. The marker stays where it was grabbed on the screen; dragging down zooms in and up
// zooms out, smoothly and along a geometric curve (so every bit of extra travel feels the same) once the finger has passed a dead zone, and
// sideways travel pulls the waveform along with the finger, covering less time the further in the view is. All of it is plain arithmetic so it can be tested and tuned.

/** The closest view: this many frames across the whole timeline. About a millisecond per 40 pixels at 44.1 kHz. */
export const MIN_SPAN_FRAMES = 360;
/** Least travel (px) that takes the zoom all the way in; the usual travel is the whole way from the finger to the bottom of the screen, so zooming is gentle. */
export const MIN_ZOOM_ROOM_PX = 120;
/** Vertical travel (px) a drag has to pass before zoom starts to take effect, so a sideways scrub that wanders a little up or down never zooms. */
export const ZOOM_DEAD_ZONE_PX = 24;

/** How much of the song the resting view shows: about half. */
export function defaultSpan(totalFrames: number): number {
  return Math.max(MIN_SPAN_FRAMES, totalFrames / 2);
}

/** The room (px) a drag that starts at screen height `y` has to zoom in: the whole way to the bottom of the screen. */
export function zoomRoom(y: number, screenHeight: number): number {
  return Math.max(MIN_ZOOM_ROOM_PX, screenHeight - y);
}

/**
 * Vertical travel that counts toward zoom: nothing until it has passed the dead zone, then the part beyond it, so zoom starts from nothing
 * with no jump as the threshold is crossed. Down is positive, up negative.
 */
export function zoomTravel(dy: number, dead = ZOOM_DEAD_ZONE_PX): number {
  const beyond = Math.max(0, Math.abs(dy) - dead);
  return beyond === 0 ? 0 : Math.sign(dy) * beyond;
}

/** Where a grabbed point is: its frame, where it sits across the view (0 = left edge, 1 = right) and how many frames the view spans. */
export interface GrabbedView {
  frame: number;
  across: number;
  span: number;
}

/** The first frame in view. */
export function viewStart(v: GrabbedView): number {
  return v.frame - v.across * v.span;
}

/**
 * Frames per pixel of drag, as a rate: the natural log of the zoom ratio per pixel of vertical travel. Dragging down by `room` pixels
 * takes the resting view all the way in to the closest. The same rate zooms out when dragging up.
 */
export function zoomRate(restingSpan: number, room: number, closest = MIN_SPAN_FRAMES): number {
  if (restingSpan <= closest) return 0;
  return Math.log(restingSpan / closest) / Math.max(1, room);
}

/**
 * The span after dragging `dy` pixels vertically from where a marker was grabbed, whatever zoom the view had then: down (positive `dy`) zooms
 * in, up zooms out, the same ratio for every equal step. It stops at the closest view and at `farthest` (the whole song).
 */
export function spanAfterDrag(spanAtGrab: number, dy: number, rate: number, farthest: number, closest = MIN_SPAN_FRAMES): number {
  return Math.min(Math.max(closest, farthest), Math.max(closest, spanAtGrab * Math.exp(-rate * dy)));
}

/**
 * One step of a drag, Ableton style: the marker keeps the place across the view where it was grabbed (`across`, 0 = left edge, 1 = right)
 * and the waveform moves under it, following the finger: the point of the waveform under the finger stays under it, so dragging right pulls
 * the waveform right and the marker, fixed on the screen, ends up earlier in the song. A pixel of travel covers `span / width` frames, less
 * the closer in the view is. Zooming only scales the view about the marker, never moving it. The marker stops at the ends of the song.
 */
export function moveMarker(v: GrabbedView, dx: number, width: number, span: number, totalFrames: number): GrabbedView {
  return { frame: Math.min(totalFrames, Math.max(0, v.frame - (dx / width) * span)), across: v.across, span };
}

/** How long a marker takes to slide back to the finger after a pause: the time constant of the exponential approach, in milliseconds. */
export const SETTLE_TAU_MS = 70;
/** Minimum travel (px) down from where the play button was pressed before releasing it keeps playback going. */
export const LATCH_DRAG_PX = 48;

/** Moves `value` toward `target`: the share of the distance left covered in `dtMs` follows an exponential, so it never overshoots and frame rate does not matter. */
export function approach(value: number, target: number, dtMs: number, tauMs = SETTLE_TAU_MS): number {
  return value + (target - value) * (1 - Math.exp(-Math.max(0, dtMs) / tauMs));
}

/** A finger that has travelled less than this (px) from where it grabbed a tab has only tapped it: the tab stays exactly where it is. */
export const TAP_SLOP_PX = 8;

/** True once a finger has moved far enough from where it grabbed to be a drag and not a tap. */
export function isDrag(dx: number, dy: number, slop = TAP_SLOP_PX): boolean {
  return Math.hypot(dx, dy) >= slop;
}

/** The first frame in view that puts `frame` in the middle of a view `span` frames across. */
export function centredStart(frame: number, span: number): number {
  return frame - span / 2;
}

/**
 * Keeps a view where something of the song is in it. The view may run past either end of the song by up to half its width, so a point at the very
 * start or end (bar 1 is often a second in) can be brought to the middle.
 */
export function clampViewStart(start: number, span: number, totalFrames: number): number {
  return Math.min(Math.max(-span / 2, start), totalFrames - span / 2);
}
