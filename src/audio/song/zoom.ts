// The maths of dragging a chop point. A point is grabbed in the zoomed-out view; dragging down zooms in, smoothly and along a geometric
// curve (so every bit of extra travel feels the same, like the pitch slider's slowdown), and the further in, the less time a pixel of
// sideways travel covers, so the point moves more and more subtly. All of it is plain arithmetic so it can be tested and tuned.

/** The closest view: this many frames across the whole timeline. About a millisecond per 40 pixels at 44.1 kHz. */
export const MIN_SPAN_FRAMES = 360;
/** Minimum travel (px) that takes the zoom all the way in; the real travel is half the room between the finger and the bottom of the screen. */
export const MIN_ZOOM_ROOM_PX = 60;

/** How much of the song the resting view shows: about half. */
export function defaultSpan(totalFrames: number): number {
  return Math.max(MIN_SPAN_FRAMES, totalFrames / 2);
}

/** 0 with the finger level with where it grabbed the point (or above), 1 when it has travelled `room` pixels down. */
export function zoomDepth(dy: number, room: number): number {
  return Math.min(1, Math.max(0, dy / Math.max(1, room)));
}

/** The room (px) a drag that starts at screen height `y` has to zoom in: half the way to the bottom of the screen. */
export function zoomRoom(y: number, screenHeight: number): number {
  return Math.max(MIN_ZOOM_ROOM_PX, (screenHeight - y) / 2);
}

/** Frames across the view at a drag depth: the resting span at 0, the closest at 1, and a constant ratio per step between. */
export function spanAt(depth: number, resting: number, closest = MIN_SPAN_FRAMES): number {
  if (resting <= closest) return resting;
  return resting * Math.pow(closest / resting, Math.min(1, Math.max(0, depth)));
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
 * One step of a drag: the finger moved `dx` pixels sideways across a view `width` pixels wide, and the zoom is now `span`.
 * The point stays under the finger (its place across the view moves by exactly the finger's travel), and the time that covers is
 * what `span` frames across `width` pixels say, so zooming in makes the same finger movement count for less.
 * A point can be pushed to the edge of the view but no further: past that the finger moves it nowhere.
 */
export function dragStep(v: GrabbedView, dx: number, width: number, span: number, edge = 0.02): GrabbedView {
  const across = Math.min(1 - edge, Math.max(edge, v.across + dx / width));
  const moved = (across - v.across) * span;
  return { frame: v.frame + moved, across, span };
}

/** How long a marker takes to slide back to the finger after a pause: the time constant of the exponential approach, in milliseconds. */
export const SETTLE_TAU_MS = 70;
/** Minimum travel (px) down from where the play button was pressed before releasing it keeps playback going. */
export const LATCH_DRAG_PX = 48;

/** Moves `value` toward `target`: the share of the distance left covered in `dtMs` follows an exponential, so it never overshoots and frame rate does not matter. */
export function approach(value: number, target: number, dtMs: number, tauMs = SETTLE_TAU_MS): number {
  return value + (target - value) * (1 - Math.exp(-Math.max(0, dtMs) / tauMs));
}

/** The same for a span, approached by ratio so zooming out feels as even as zooming in. */
export function approachSpan(span: number, target: number, dtMs: number, tauMs = SETTLE_TAU_MS): number {
  return span * Math.pow(target / span, 1 - Math.exp(-Math.max(0, dtMs) / tauMs));
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
