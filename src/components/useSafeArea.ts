import { useEffect } from "react";

/**
 * Sets `--safe-bottom` to the part of the bottom safe area that is really inside the page.
 *
 * Measured on an iPhone with the installed app (iOS 26): the screen is 874 pt tall but the page is only 812 pt tall, drawn from the top, with
 * 62 pt of black under it. The page still reports a bottom safe area of 34 pt, but the home indicator sits in that black strip, so padding for it
 * inside the page only wastes room. So in an installed app the bottom inset is reduced by however much shorter the page is than the screen
 * (and is untouched where the page fills the screen, as on other phones and versions). `--safe-top` is left to CSS: the page does start at the
 * top of the screen under the status bar, so that inset is real.
 */
export function useSafeArea() {
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement.style;
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;visibility:hidden;left:0;top:0;width:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px)";
      document.body.appendChild(probe);
      const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
      const portrait = matchMedia("(orientation: portrait)").matches;
      const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      const lost = installed ? Math.max(0, screenHeight - window.innerHeight) : 0;
      root.setProperty("--safe-bottom", `${Math.max(0, inset - lost)}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", () => setTimeout(apply, 300));
    return () => window.removeEventListener("resize", apply);
  }, []);
}
