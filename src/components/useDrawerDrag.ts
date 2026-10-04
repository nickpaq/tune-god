import { useRef } from "react";

/** Drag up this fraction of the drawer's height (or flick faster than FLICK_PX_PER_MS) and it closes on release. */
const CLOSE_FRACTION = 0.3;
const FLICK_PX_PER_MS = 0.6;
/** Movement under this is a tap, not a drag. */
const TAP_SLOP_PX = 4;

/**
 * Makes a drawer's handle draggable: the drawer follows the finger up (never further down than shut-open), and on
 * release it either slides shut or springs back. A tap on the handle still closes it.
 */
export function useDrawerDrag(onClose: () => void) {
  const drag = useRef<{ y: number; el: HTMLElement; height: number; moved: boolean; time: number } | null>(null);
  const swallowClick = useRef(false);

  const offset = (e: React.PointerEvent, y: number) => Math.min(0, e.clientY - y);

  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      const el = e.currentTarget.closest<HTMLElement>(".drawer");
      if (!el) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { y: e.clientY, el, height: el.offsetHeight, moved: false, time: performance.now() };
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d) return;
      const dy = offset(e, d.y);
      if (dy < -TAP_SLOP_PX) d.moved = true;
      if (!d.moved) return;
      // No transition while the finger is down, so the drawer sticks to it.
      d.el.style.transition = "none";
      d.el.style.transform = `translateY(${dy}px)`;
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      const dy = offset(e, d.y);
      const flick = -dy / Math.max(1, performance.now() - d.time) > FLICK_PX_PER_MS;
      // Handing back the transition and transform lets the drawer animate on from where the finger left it.
      d.el.style.transition = "";
      d.el.style.transform = "";
      swallowClick.current = true;
      setTimeout(() => (swallowClick.current = false), 0);
      if (-dy > d.height * CLOSE_FRACTION || flick) onClose();
    },
    onPointerCancel() {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      d.el.style.transition = "";
      d.el.style.transform = "";
    },
    onClick() {
      if (!swallowClick.current) onClose();
    },
  };
}
