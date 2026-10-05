import { useEffect } from "react";

/** The smallest cell the fit may go down to, as a share of the width-based one (below that the pixel font is too small to read). */
const MIN_CELL_SHARE = 0.6;
/** The hot-swap list's cell as a share of the screen's cell. */
const SWAP_CELL_SHARE = 0.8;

/**
 * Every piece of text on the OLED that is drawn outside the screen or cut off by a box it sits in. Text that is cut on purpose with an
 * ellipsis only counts when it is cut top or bottom. Returns a short description of each, for the console.
 */
export function clippedOledText(oled: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(oled, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || getComputedStyle(parent).visibility === "hidden") continue;
    range.selectNodeContents(node);
    // Each line by its em box: the browser's text box is the font's whole ascender-to-descender area (about 1.27 em for Silkscreen), which
    // reaches past a bar that holds the letters with room to spare; the em box is still larger than the lit pixels.
    const half = parseFloat(getComputedStyle(parent).fontSize) / 2;
    const lines = [...range.getClientRects()].filter((r) => r.width && r.height);
    if (!lines.length) continue; // not displayed
    const text = {
      left: Math.min(...lines.map((r) => r.left)),
      right: Math.max(...lines.map((r) => r.right)),
      top: Math.min(...lines.map((r) => (r.top + r.bottom) / 2 - Math.min(half, r.height / 2))),
      bottom: Math.max(...lines.map((r) => (r.top + r.bottom) / 2 + Math.min(half, r.height / 2))),
    };
    // the text against every box between it and the screen that cuts off what spills out of it, the screen included
    for (let box: HTMLElement | null = parent; box; box = box === oled ? null : box.parentElement) {
      const style = getComputedStyle(box);
      if (box !== oled && style.overflowX === "visible" && style.overflowY === "visible") continue;
      const r = box.getBoundingClientRect();
      const ellipsis = style.textOverflow === "ellipsis" || getComputedStyle(parent).textOverflow === "ellipsis";
      const slack = 0.5;
      // A box that scrolls (the hot-swap list) only shows part of its content on purpose, so it never cuts text off vertically.
      const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
      const vertical = !scrolls && (text.top < r.top - slack || text.bottom > r.bottom + slack);
      const horizontal = !ellipsis && (text.left < r.left - slack || text.right > r.right + slack);
      if (vertical || horizontal) {
        out.push(`"${node.textContent.trim().slice(0, 24)}" in .${parent.className || parent.tagName}`);
        break;
      }
    }
  }
  return out;
}

/**
 * Lays the OLED's pixel grid on whole device pixels. The pixel font draws each of its pixels as one eighth of the font
 * size, so the screen's text only lands on lit or unlit cells when a cell is a whole number of device pixels and the
 * screen itself starts on a device pixel. `--c` (one cell) and `--cl` (the grid line) are set on the root, everything on
 * the OLED is sized in cells, and the screen is nudged by the sub-pixel remainder of where the layout put it.
 *
 * The cell starts from the phone's width, but the screen's height depends on the phone's height and on what else is on
 * the chassis, so the text could outgrow a short screen and be cut off. So after every layout the text is checked
 * (`clippedOledText`) and the cell is stepped down a device pixel at a time until all of it fits; it grows back as soon
 * as there is room. Nothing on the screen can be cut off by its size, whatever is added to it.
 */
export function useOledCell() {
  useEffect(() => {
    let frame = 0;
    let observedOled: HTMLElement | null = null;
    let lastKey = "";

    const setCell = (cell: number, ratio: number) => {
      const root = document.documentElement.style;
      root.setProperty("--c", `${cell / ratio}px`);
      // The hot-swap list's own cell, between the full cell and the smallest the fit goes to, the same on every bank.
      root.setProperty("--c-swap", `${Math.max(2, Math.round(cell * SWAP_CELL_SHARE)) / ratio}px`);
      root.setProperty("--cl", `${Math.max(1, Math.round(cell / 4)) / ratio}px`);
    };

    const apply = () => {
      frame = 0;
      const phone = document.querySelector<HTMLElement>(".phone");
      const ratio = window.devicePixelRatio || 1;
      const width = phone?.clientWidth || window.innerWidth;
      const base = Math.max(3, Math.round(width * ratio * 0.007));
      const oled = document.querySelector<HTMLElement>(".oled");
      if (oled !== observedOled) {
        if (observedOled) sizes.unobserve(observedOled);
        if (oled) sizes.observe(oled);
        observedOled = oled;
      }
      if (!oled) {
        setCell(base, ratio);
        return;
      }
      // Only refit when something the fit depends on changed: the base size, the screen's box or its text.
      const box = oled.getBoundingClientRect();
      const key = `${base}|${ratio}|${box.width.toFixed(1)}x${box.height.toFixed(1)}|${oled.textContent}`;
      if (key !== lastKey) {
        const floor = Math.max(2, Math.round(base * MIN_CELL_SHARE));
        let cell = base;
        setCell(cell, ratio);
        while (cell > floor && clippedOledText(oled).length > 0) setCell(--cell, ratio);
        if (cell === floor) {
          const left = clippedOledText(oled);
          if (left.length) console.warn("OLED text still cut off at the smallest cell:", left);
        }
        const after = oled.getBoundingClientRect();
        lastKey = `${base}|${ratio}|${after.width.toFixed(1)}x${after.height.toFixed(1)}|${oled.textContent}`;
      }
      oled.style.left = oled.style.top = "0px";
      const placed = oled.getBoundingClientRect();
      const nudge = (edge: number) => (Math.round(edge * ratio) - edge * ratio) / ratio;
      oled.style.left = `${nudge(placed.left)}px`;
      oled.style.top = `${nudge(placed.top)}px`;
    };
    // One fit per frame, however many changes come in.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const sizes = new ResizeObserver(schedule);

    apply();
    // The screen is replaced, resized and rewritten as the app changes, so the fit and the nudge are worked out again after each layout.
    sizes.observe(document.documentElement);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    // The pixel font arriving changes how wide the text is.
    void document.fonts?.ready.then(() => {
      lastKey = "";
      schedule();
    });
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
}
