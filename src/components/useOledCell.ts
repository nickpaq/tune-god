import { useEffect } from "react";

/**
 * Lays the OLED's pixel grid on whole device pixels. The pixel font draws each of its pixels as one eighth of the font
 * size, so the screen's text only lands on lit or unlit cells when a cell is a whole number of device pixels and the
 * screen itself starts on a device pixel. `--c` (one cell) and `--cl` (the grid line) are set on the root, everything on
 * the OLED is sized in cells, and the screen is nudged by the sub-pixel remainder of where the layout put it.
 */
export function useOledCell() {
  useEffect(() => {
    const apply = () => {
      const phone = document.querySelector<HTMLElement>(".phone");
      const ratio = window.devicePixelRatio || 1;
      const width = phone?.clientWidth || window.innerWidth;
      const cell = Math.max(3, Math.round(width * ratio * 0.007));
      const root = document.documentElement.style;
      root.setProperty("--c", `${cell / ratio}px`);
      root.setProperty("--cl", `${Math.max(1, Math.round(cell / 4)) / ratio}px`);
      const oled = document.querySelector<HTMLElement>(".oled");
      if (!oled) return;
      oled.style.left = oled.style.top = "0px";
      const box = oled.getBoundingClientRect();
      const nudge = (edge: number) => (Math.round(edge * ratio) - edge * ratio) / ratio;
      oled.style.left = `${nudge(box.left)}px`;
      oled.style.top = `${nudge(box.top)}px`;
    };
    apply();
    // The screen is replaced and resized as the app changes, so the nudge is worked out again after each layout.
    const observer = new ResizeObserver(apply);
    observer.observe(document.documentElement);
    const mutations = new MutationObserver(apply);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);
}
