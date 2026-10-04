import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-semi-condensed/500.css'
import '@fontsource/barlow-semi-condensed/600.css'
import '@fontsource/barlow-semi-condensed/700.css'
import '@fontsource/silkscreen/400.css'
import './index.css'
import App from './App.tsx'

// Belt and braces for iOS Safari, which can still scroll, rubber-band or pinch-zoom a page that is
// `overflow: hidden`: cancel page-level touch moves and pinch gestures. The palette list, classifier drawer and hot-swap list are the
// only places that legitimately scroll; everything else (pads, sliders, keys) uses pointer events.
document.addEventListener(
  "touchmove",
  (e) => {
    if (!(e.target as Element | null)?.closest?.(".palette-modal__list, .drawer__list, .swap-list__rows")) e.preventDefault();
  },
  { passive: false },
);
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault());
}

// Installed on iOS, the viewport units (and innerHeight) come out as if the page were in Safari, one status bar short or
// worse, so the chassis ends early and the transport row is clipped. On an installed iOS app the screen is the whole app,
// so size to it. Older iOS flags the app with `navigator.standalone`; newer iOS web apps opened from a manifest may only
// match the display-mode query, so check both. iOS doesn't swap screen.width/height on rotation, so pick by orientation.
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const installed = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
if (ios) {
  const fit = () => {
    const root = document.documentElement;
    if (!installed()) {
      root.style.removeProperty("--app-h");
      return;
    }
    const portrait = matchMedia("(orientation: portrait)").matches;
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    root.style.setProperty("--app-h", `${Math.max(window.innerHeight, portrait ? long : short)}px`);
  };
  fit();
  addEventListener("resize", fit);
  addEventListener("orientationchange", () => setTimeout(fit, 300));
  addEventListener("pageshow", fit);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
